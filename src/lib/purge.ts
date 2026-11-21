import "server-only";
import { eq, inArray } from "drizzle-orm";
import { revokeAllConnections } from "./connected/scan";
import { db, schema } from "./db";
import { cardImageKey, deleteKey, deleteKeys, revisionKey } from "./s3";

const { annotations, cardImages, revisionFiles, revisionSpaces, users } = schema;

export async function revisionFileIdsOfSpace(spaceId: string) {
  return (await db.select({ id: revisionFiles.id }).from(revisionFiles).where(eq(revisionFiles.spaceId, spaceId))).map((f) => f.id);
}

export async function revisionFileIdsOfDocument(documentId: string) {
  const rows = await db.select({ id: revisionFiles.id }).from(revisionFiles).innerJoin(revisionSpaces, eq(revisionFiles.spaceId, revisionSpaces.id)).where(eq(revisionSpaces.documentId, documentId));
  return rows.map((f) => f.id);
}

/** Après la suppression en base. Un échec du stockage ne l'annule pas : le ménage périodique retrouvera l'objet. */
export async function purgeRevisionFiles(ids: string[]) {
  if (!ids.length) return;
  await deleteKeys(ids.map(revisionKey)).catch((error) => console.error("photos de révision non effacées", error));
}

/** Le seul chemin de suppression d'un compte : les cascades effacent les lignes, jamais les fichiers. */
export async function deleteUserAccount(user: { id: string; avatarKey: string | null }) {
  const own = await db.select({ id: revisionFiles.id }).from(revisionFiles).innerJoin(revisionSpaces, eq(revisionFiles.spaceId, revisionSpaces.id)).where(eq(revisionSpaces.ownerId, user.id));
  // Ses photos dans l'espace d'un ami : l'espace reste, mais ses notes partent, et ses photos avec
  const posted = await db.select({ id: annotations.photoId }).from(annotations).where(eq(annotations.authorId, user.id));
  const photos = [...new Set([...own.map((f) => f.id), ...posted.flatMap((a) => a.id ?? [])])];
  // Sans cela, l'accès à son Drive resterait accordé côté Google. Une panne là-bas n'empêche pas l'effacement.
  await revokeAllConnections(user.id).catch((error) => console.warn("dossier connecté :", (error as Error).message));
  // Image de bannière : la ligne part avec le compte, le fichier non
  const [profile] = await db.select({ banner: schema.userProfiles.banner }).from(schema.userProfiles).where(eq(schema.userProfiles.userId, user.id));
  // Images de ses fiches : les lignes partent en cascade, les fichiers non
  const cardImageIds = (await db.select({ id: cardImages.id }).from(cardImages).where(eq(cardImages.ownerId, user.id))).map((image) => image.id);
  await db.transaction(async (tx) => {
    if (photos.length) await tx.delete(revisionFiles).where(inArray(revisionFiles.id, photos));
    await tx.delete(users).where(eq(users.id, user.id));
  });
  await purgeRevisionFiles(photos);
  if (cardImageIds.length) await deleteKeys(cardImageIds.map(cardImageKey)).catch((error) => console.error("images de fiches non effacées", error));
  if (user.avatarKey) await deleteKey(user.avatarKey).catch(() => undefined);
  if (profile?.banner?.kind === "image" && profile.banner.key) await deleteKey(profile.banner.key).catch(() => undefined);
}
