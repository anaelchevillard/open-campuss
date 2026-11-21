import "server-only";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { purgeRevisionFiles, revisionFileIdsOfDocument } from "@/lib/purge";
import { deleteKey, deletePrefix, docPrefix, fileKey } from "@/lib/s3";
import { forgetAllShellCounters } from "@/lib/shell-cache";

/** Durée de la corbeille : un document supprimé reste restaurable 30 jours. */
export const TRASH_DAYS = 30;
const { documents, docFiles } = schema;

/** Met un document à la corbeille : il disparaît de toutes les listes et répond 404, sauf à son auteur et à l'administration. */
export async function trashDocument(id: string, by: string | null) {
  const [doc] = await db.update(documents).set({ deletedAt: new Date(), deletedBy: by }).where(eq(documents.id, id)).returning({ id: documents.id, title: documents.title });
  forgetAllShellCounters();
  return doc ?? null;
}

export async function restoreDocument(id: string) {
  const [doc] = await db.update(documents).set({ deletedAt: null, deletedBy: null }).where(eq(documents.id, id)).returning({ id: documents.id, title: documents.title });
  forgetAllShellCounters();
  return doc ?? null;
}

/** Suppression définitive : fichiers S3, photos des espaces de révision, puis la ligne (la copie Drive suit au tour suivant). */
export async function purgeNow(id: string) {
  const files = await db.select({ id: docFiles.id }).from(docFiles).where(eq(docFiles.documentId, id));
  const photos = await revisionFileIdsOfDocument(id);
  const [doc] = await db.delete(documents).where(eq(documents.id, id)).returning({ id: documents.id, title: documents.title });
  if (!doc) return null;
  await deletePrefix(docPrefix(id));
  await Promise.all(files.map((f) => deleteKey(fileKey(f.id))));
  await purgeRevisionFiles(photos);
  return doc;
}

/** Appelé une fois par jour par la boucle de boot.ts. */
export async function purgeExpiredTrash(now = new Date()) {
  const expired = await db.select({ id: documents.id }).from(documents)
    .where(and(isNotNull(documents.deletedAt), lt(documents.deletedAt, new Date(now.getTime() - TRASH_DAYS * 86_400_000))));
  for (const { id } of expired) await purgeNow(id).catch((error) => console.warn("corbeille :", (error as Error).message));
  return expired.length;
}
