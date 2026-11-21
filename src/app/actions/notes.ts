"use server";

import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canModerate } from "@/lib/access";
import { canEdit } from "@/lib/access-server";
import { audit, requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { addCoauthor } from "@/lib/document-authors";
import { academicYearNow } from "@/lib/documents";
import { membersCount, openNotesOf } from "@/lib/notes";
import { cleanTurns, MAX_NOTES_MEMBERS, notesTitle } from "@/lib/notes-rules";
import { rateHit, rateLimited } from "@/lib/security";

const { collabNotes, documents, docAuthors, subjects } = schema;

/** Crée le brouillon partagé et ouvre l'éditeur. Un second clic dans la journée rouvre le même. */
export async function startNotes(form: FormData) {
  const user = await requireUser();
  const subjectId = z.coerce.number().int().positive().parse(form.get("subject"));
  const [subject] = await db.select().from(subjects).where(eq(subjects.id, subjectId));
  if (!subject || user.role === "teacher" || (user.role !== "admin" && subject.programId !== user.programId)) throw new Error("accès refusé");
  const [recent] = await db.select({ id: documents.id }).from(collabNotes).innerJoin(documents, eq(collabNotes.documentId, documents.id))
    .where(and(eq(collabNotes.startedBy, user.id), eq(documents.subjectId, subjectId), eq(documents.published, false), isNull(collabNotes.closedAt), gt(collabNotes.createdAt, new Date(Date.now() - 12 * 3_600_000))))
    .orderBy(desc(collabNotes.createdAt)).limit(1);
  if (recent) redirect(`/editer/${recent.id}`);
  const key = `notes-start:${user.id}`;
  if (await rateLimited(key, 6, 1440)) throw new Error("trop de prises de notes aujourd’hui");
  await rateHit(key);
  const id = await db.transaction(async (tx) => {
    const [doc] = await tx.insert(documents).values({ title: notesTitle(new Date()), category: "cours", subjectId, programId: subject.programId, kind: "editor", published: false, bodyMarkdown: "", createdBy: user.id, rightsBasis: "unknown", academicYear: academicYearNow() }).returning({ id: documents.id });
    await tx.insert(collabNotes).values({ documentId: doc.id, startedBy: user.id, open: canModerate(user, subject) });
    return doc.id;
  });
  await audit(user.email, "notes_démarrées", id);
  redirect(`/editer/${id}`);
}

/** Le groupe d'un délégué : pas d'annuaire pour choisir les gens, ce sont eux qui rejoignent depuis la matière. */
export async function joinNotes(form: FormData) {
  const user = await requireUser();
  const id = z.uuid().parse(form.get("id"));
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  const notes = doc && await openNotesOf(id);
  if (!doc || !notes || doc.published) throw new Error("accès refusé");
  if (!(await canEdit(user, doc))) {
    if (!notes.open || doc.programId !== user.programId) throw new Error("accès refusé");
    if (await membersCount(id) >= MAX_NOTES_MEMBERS) throw new Error("groupe complet");
    await addCoauthor(id, user.id);
  }
  redirect(`/editer/${id}`);
}

/** Organisé par le délégué, ou par celui qui a lancé les notes entre amis. */
export async function saveTurns(rawId: string, raw: unknown): Promise<{ error?: string }> {
  const user = await requireUser();
  const id = z.uuid().parse(rawId);
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  const notes = doc && await openNotesOf(id);
  if (!doc || !notes || !(canModerate(user, doc) || notes.startedBy === user.id)) return { error: "Seul le délégué organise le tour de rôle." };
  const coauthors = await db.select({ id: docAuthors.userId }).from(docAuthors).where(eq(docAuthors.documentId, id));
  const members = new Set([...coauthors.map((c) => c.id), ...(doc.createdBy ? [doc.createdBy] : [])]);
  await db.update(collabNotes).set({ turns: cleanTurns(raw, members) }).where(eq(collabNotes.documentId, id));
  revalidatePath(`/editer/${id}`);
  return {};
}
