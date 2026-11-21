"use server";

import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveDocument } from "@/app/actions/course";
import { audit, requireUser } from "@/lib/auth";
import { forgetPages } from "@/lib/connected/pages-cache";
import { ConnectionLost, downloadGoogleFile, FileTooLarge } from "@/lib/connected/providers";
import { CONNECTED_PAGE, fileNameFor, isProvider, MAX_BATCH, type Provider } from "@/lib/connected/rules";
import { accessTokenOf, disconnectFolder } from "@/lib/connected/scan";
import { folderOf, importProviders } from "@/lib/connected/status";
import { db, schema } from "@/lib/db";
import { academicYearNow } from "@/lib/documents";
import { reusableEmptyDraft } from "@/lib/empty-draft";
import { ImportError, importFile, importNotionPage } from "@/lib/import";
import { importQueue } from "@/lib/import-queue";
import { rateHit, rateLimited } from "@/lib/security";
import { QueueFullError, QueueTimeoutError } from "@/lib/serial-queue";
import { quotaLeft } from "@/lib/storage-usage";

const { connectedFolders, connectedItems, documents, subjects } = schema;

/**
 * Le brouillon d'où part chaque création : même règle que createBlankDraft (un brouillon vide est réutilisé),
 * mais l'identifiant revient au navigateur, qui garde son élan (`?depart=`, photos en mémoire).
 */
export async function startDraft(rawSubject: string | number | null): Promise<{ id: string } | { error: string }> {
  const user = await requireUser();
  const subjectId = rawSubject !== null && /^\d+$/.test(String(rawSubject)) ? Number(rawSubject) : null;
  const [subject] = subjectId ? await db.select().from(subjects).where(eq(subjects.id, subjectId)) : [];
  const allowed = subject && (user.role === "admin" || subject.programId === user.programId) ? subject : null;
  const [fallback] = user.role === "admin" && !user.programId && !allowed ? await db.select({ id: schema.programs.id }).from(schema.programs).orderBy(asc(schema.programs.position)).limit(1) : [];
  const programId = allowed?.programId ?? user.programId ?? fallback?.id;
  if (!programId) return { error: "Ton compte n’est rattaché à aucune licence." };
  const [empty] = await db.select({ id: documents.id }).from(documents).where(reusableEmptyDraft(user.id, programId)).limit(1);
  if (empty) {
    if (allowed) await db.update(documents).set({ subjectId: allowed.id, programId: allowed.programId }).where(eq(documents.id, empty.id));
    return { id: empty.id };
  }
  const key = `draft:${user.id}`;
  if (await rateLimited(key, 15, 1440)) return { error: "Tu as créé beaucoup de brouillons aujourd’hui. Réessaie demain." };
  const [doc] = await db.insert(documents).values({
    title: "", category: "cours", subjectId: allowed?.id ?? null, programId, kind: "editor", published: false, bodyMarkdown: "", createdBy: user.id, rightsBasis: "unknown", academicYear: academicYearNow(),
  }).returning({ id: documents.id });
  await rateHit(key);
  await audit(user.email, "brouillon_créé", doc.id);
  return { id: doc.id };
}

async function ownProvider(raw: unknown): Promise<Provider> {
  if (!isProvider(raw) || !(await importProviders()).includes(raw)) throw new Error("service inconnu");
  return raw;
}

/** L'ancien « dossier connecté » : chaque semaine, les pages modifiées sont proposées. S'enregistre seul. */
export async function setWeekly(rawProvider: string, on: boolean): Promise<{ error?: string }> {
  const user = await requireUser();
  const provider = await ownProvider(rawProvider);
  const folder = await folderOf(user.id, provider);
  if (!folder) return { error: "Connecte d’abord ce compte." };
  // Activer repart de maintenant : seules les pages modifiées ensuite seront proposées
  await db.update(connectedFolders).set({ weekly: Boolean(on), ...(on && !folder.weekly ? { lastCheckedAt: new Date() } : {}) }).where(eq(connectedFolders.id, folder.id));
  revalidatePath(CONNECTED_PAGE);
  return {};
}

export async function disconnectProvider(rawProvider: string): Promise<{ revoked: boolean }> {
  const user = await requireUser();
  const provider = await ownProvider(rawProvider);
  const folder = await folderOf(user.id, provider);
  if (!folder) return { revoked: true };
  const revoked = await disconnectFolder(folder);
  forgetPages(user.id, provider);
  await audit(user.email, "dossier_déconnecté", provider);
  revalidatePath(CONNECTED_PAGE);
  return { revoked };
}

export async function ignoreItems(rawIds: string[]) {
  const user = await requireUser();
  const ids = z.array(z.uuid()).max(MAX_BATCH).parse(rawIds);
  const mine = await db.select({ id: connectedFolders.id }).from(connectedFolders).where(eq(connectedFolders.userId, user.id));
  if (ids.length && mine.length) await db.update(connectedItems).set({ status: "ignored" }).where(and(inArray(connectedItems.id, ids), inArray(connectedItems.folderId, mine.map((f) => f.id))));
  revalidatePath(CONNECTED_PAGE);
}

/**
 * Une note proposée devient un brouillon, ouvert sur sa page finale : la matière, l'origine et l'engagement
 * se renseignent là, comme pour tout cours.
 */
export async function draftFromItem(rawId: string): Promise<{ id: string } | { error: string }> {
  const user = await requireUser();
  const [row] = await db.select({ item: connectedItems, folder: connectedFolders }).from(connectedItems).innerJoin(connectedFolders, eq(connectedItems.folderId, connectedFolders.id))
    .where(and(eq(connectedItems.id, z.uuid().parse(rawId)), eq(connectedFolders.userId, user.id)));
  if (!row || row.item.status !== "proposed") return { error: "Cette note n’est plus proposée." };
  const key = `import:${user.id}`;
  if (await rateLimited(key, 30, 1440)) return { error: "Trop d’imports aujourd’hui. Réessaie demain." };
  await rateHit(key);
  const room = await quotaLeft(user, user.id);
  if (room === 0) return { error: "Ton espace est plein : libère de la place avant d’importer." };
  const draft = await startDraft(null);
  if ("error" in draft) return draft;
  const { item, folder } = row;
  try {
    const token = await accessTokenOf(folder);
    const blocks = await importQueue.run(async () => {
      if (folder.provider === "notion") return importNotionPage(draft.id, item.externalId, token);
      return (await importFile(draft.id, fileNameFor(item.title, item.mime), await downloadGoogleFile(token, item.externalId, item.mime), room)).blocks;
    });
    const saved = await saveDocument(draft.id, { title: item.title, subject: null, category: "cours", chapter: "", semester: "", rights: "unknown", teacher: "" }, blocks);
    if (saved.error) return { error: saved.error };
    await db.update(connectedItems).set({ status: "shared", documentId: draft.id, importedByHand: true }).where(eq(connectedItems.id, item.id));
    revalidatePath(CONNECTED_PAGE);
    return { id: draft.id };
  } catch (error) {
    if (error instanceof ConnectionLost) {
      await db.update(connectedFolders).set({ brokenAt: new Date() }).where(eq(connectedFolders.id, folder.id));
      revalidatePath(CONNECTED_PAGE);
      return { error: "L’accès à ton compte a été retiré : reconnecte-le." };
    }
    if (error instanceof ImportError) return { error: `« ${item.title} » : ${error.message}` };
    if (error instanceof FileTooLarge) return { error: `« ${item.title} » dépasse 16 Mo.` };
    if (error instanceof QueueFullError || error instanceof QueueTimeoutError) return { error: "Beaucoup d’imports en ce moment. Réessaie dans une minute." };
    console.warn("compte connecté, import :", (error as Error).message);
    return { error: `« ${item.title} » n’a pas pu être récupéré.` };
  }
}
