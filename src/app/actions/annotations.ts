"use server";

import { and, asc, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { canRead } from "@/lib/access-server";
import { MARK_KINDS, HIGHLIGHT_COLORS, MAX_ANNOTATIONS_PER_SPACE } from "@/lib/annotate";
import { requireUser } from "@/lib/auth";
import { purgeRevisionFiles } from "@/lib/purge";
import { db, schema } from "@/lib/db";
import { rateHit, rateLimited } from "@/lib/security";
import { revisionAccess } from "@/lib/revision";
import type { AnnotationRow } from "@/lib/annotation-types";

const { annotations, documents, revisionFiles, revisionSpaces, users } = schema;
const MAX_NOTE = 4000;

const anchor = z.object({
  start: z.number().int().min(-1).max(5_000_000), end: z.number().int().min(-1).max(5_000_000),
  quote: z.string().max(40_000), prefix: z.string().max(40), suffix: z.string().max(40),
});
const uuid = z.uuid();
const newMark = anchor.extend({ id: uuid, kind: z.enum(MARK_KINDS), color: z.enum(HIGHLIGHT_COLORS).nullable() });

async function listRows(spaceId: string): Promise<AnnotationRow[]> {
  const rows = await db.select({ row: annotations, name: users.name, avatarKey: users.avatarKey }).from(annotations).innerJoin(users, eq(annotations.authorId, users.id)).where(eq(annotations.spaceId, spaceId)).orderBy(asc(annotations.createdAt));
  return rows.map(({ row, name, avatarKey }) => ({
    id: row.id, kind: row.kind, color: row.color, start: row.start, end: row.end, quote: row.quote, prefix: row.prefix, suffix: row.suffix, note: row.note,
    photo: row.photoId ? `/revision-files/${row.photoId}?inline=1` : null, parentId: row.parentId, authorId: row.authorId, authorName: name, authorAvatar: avatarKey, createdAt: row.createdAt.toISOString(),
  }));
}

export async function listAnnotations(rawSpace: string) {
  const user = await requireUser();
  if (user.viewing) return [];
  const spaceId = uuid.parse(rawSpace);
  if (!(await revisionAccess(spaceId, user.id))) throw new Error("accès refusé");
  return listRows(spaceId);
}

/** Ta couche sur ce cours n'existe qu'à ta première annotation : ouvrir un cours n'écrit rien. */
async function spaceFor(rawDocument: string, rawSpace: string | null) {
  const user = await requireUser();
  if (rawSpace) {
    const spaceId = uuid.parse(rawSpace);
    if (!(await revisionAccess(spaceId, user.id))) throw new Error("accès refusé");
    return { user, spaceId };
  }
  const documentId = uuid.parse(rawDocument);
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc || doc.kind !== "editor" || !(await canRead(user, doc))) throw new Error("accès refusé");
  await db.insert(revisionSpaces).values({ documentId, ownerId: user.id }).onConflictDoNothing();
  const [space] = await db.select({ id: revisionSpaces.id }).from(revisionSpaces).where(and(eq(revisionSpaces.documentId, documentId), eq(revisionSpaces.ownerId, user.id)));
  return { user, spaceId: space.id };
}

async function underLimit(spaceId: string, adding: number) {
  const [{ n }] = await db.select({ n: count() }).from(annotations).where(eq(annotations.spaceId, spaceId));
  return n + adding <= MAX_ANNOTATIONS_PER_SPACE;
}

/** Une marque se remplace d'un bloc : retirer des morceaux et en poser d'autres doit rester atomique. */
export async function applyMarks(rawDocument: string, rawSpace: string | null, rawPlan: unknown) {
  const plan = z.object({ remove: z.array(uuid).max(500), add: z.array(newMark).max(500) }).parse(rawPlan);
  const { user, spaceId } = await spaceFor(rawDocument, rawSpace);
  if (!(await underLimit(spaceId, plan.add.length))) return { error: "Tu as atteint le nombre maximum d’annotations sur ce cours.", spaceId, rows: await listRows(spaceId) };
  await db.transaction(async (tx) => {
    if (plan.remove.length) await tx.delete(annotations).where(and(eq(annotations.spaceId, spaceId), inArray(annotations.id, plan.remove)));
    if (plan.add.length) await tx.insert(annotations).values(plan.add.map((m) => ({ ...m, spaceId, authorId: user.id }))).onConflictDoNothing();
  });
  return { spaceId, rows: await listRows(spaceId) };
}

/** Une photo a besoin de son espace avant même que la note n'existe. */
export async function ensureSpace(rawDocument: string, rawSpace: string | null) {
  return (await spaceFor(rawDocument, rawSpace)).spaceId;
}

export async function addNote(rawDocument: string, rawSpace: string | null, rawAnchor: unknown, rawText: string, rawParent: string | null, rawPhoto: string | null) {
  const position = anchor.parse(rawAnchor);
  const text = z.string().trim().max(MAX_NOTE).parse(rawText);
  const { user, spaceId } = await spaceFor(rawDocument, rawSpace);
  if (!text && !rawPhoto) return { spaceId, rows: await listRows(spaceId) };
  const key = `annotation-note:${user.id}`;
  if (await rateLimited(key, 300, 60) || !(await underLimit(spaceId, 1))) return { error: "Trop de notes pour l’instant. Réessaie plus tard.", spaceId, rows: await listRows(spaceId) };
  await rateHit(key);
  let parentId: string | null = null;
  if (rawParent) {
    const [parent] = await db.select({ id: annotations.id }).from(annotations).where(and(eq(annotations.id, uuid.parse(rawParent)), eq(annotations.spaceId, spaceId), eq(annotations.kind, "note")));
    parentId = parent?.id ?? null;
  }
  let photoId: string | null = null;
  if (rawPhoto) {
    const [photo] = await db.select({ id: revisionFiles.id }).from(revisionFiles).where(and(eq(revisionFiles.id, uuid.parse(rawPhoto)), eq(revisionFiles.spaceId, spaceId)));
    photoId = photo?.id ?? null;
  }
  await db.insert(annotations).values({ ...position, spaceId, authorId: user.id, kind: "note", note: text, parentId, photoId });
  return { spaceId, rows: await listRows(spaceId) };
}

/** Les notes se modifient par leur auteur seul. Le propriétaire de l'espace peut retirer ce qui s'y trouve. */
async function noteFor(rawId: string) {
  const user = await requireUser();
  const [row] = await db.select().from(annotations).where(eq(annotations.id, uuid.parse(rawId)));
  if (!row) throw new Error("accès refusé");
  const access = await revisionAccess(row.spaceId, user.id);
  if (!access) throw new Error("accès refusé");
  return { user, row, owner: access.owner };
}

export async function updateNote(rawId: string, rawText: string) {
  const { user, row } = await noteFor(rawId);
  if (row.authorId !== user.id || row.kind !== "note") throw new Error("accès refusé");
  await db.update(annotations).set({ note: z.string().trim().min(1).max(MAX_NOTE).parse(rawText), updatedAt: new Date() }).where(eq(annotations.id, row.id));
  return listRows(row.spaceId);
}

export async function deleteNote(rawId: string) {
  const { user, row, owner } = await noteFor(rawId);
  if (row.authorId !== user.id && !owner) throw new Error("accès refusé");
  await db.delete(annotations).where(eq(annotations.id, row.id));
  // Les réponses partent en cascade : leurs photos éventuelles reviennent au ménage périodique
  if (row.photoId) {
    await db.delete(revisionFiles).where(eq(revisionFiles.id, row.photoId));
    await purgeRevisionFiles([row.photoId]);
  }
  return listRows(row.spaceId);
}
