import "server-only";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { areFriends } from "./friends";
import { canSeePack, FREE_SCOPE, type PackViewer } from "./memo-pack-rules";

const { cardImages, flashcards, memoPacks } = schema;

const citing = (imageId: string) => {
  const pattern = `%/card-images/${imageId}%`;
  return or(sql`${flashcards.front} like ${pattern}`, sql`${flashcards.back} like ${pattern}`);
};

/**
 * Qui voit l'image d'une fiche : son auteur ; qui a une fiche qui la cite (copie d'un paquet lisible) ;
 * qui peut lire un paquet de l'auteur (amis, licence, modération) contenant une fiche qui la cite.
 */
export async function readableCardImage(viewer: PackViewer, imageId: string) {
  const [image] = await db.select().from(cardImages).where(eq(cardImages.id, imageId));
  if (!image) return null;
  if (image.ownerId === viewer.id) return image;
  const [copied] = await db.select({ id: flashcards.id }).from(flashcards).where(and(eq(flashcards.userId, viewer.id), citing(imageId))).limit(1);
  if (copied) return image;
  const scopes = await db.selectDistinct({ documentId: flashcards.documentId }).from(flashcards).where(and(eq(flashcards.userId, image.ownerId), citing(imageId)));
  if (!scopes.length) return null;
  const packs = await db.select().from(memoPacks).where(and(eq(memoPacks.ownerId, image.ownerId), inArray(memoPacks.scope, scopes.map((s) => s.documentId ?? FREE_SCOPE)), or(eq(memoPacks.public, true), eq(memoPacks.friends, true))));
  if (!packs.length) return null;
  const friend = packs.some((p) => p.friends) ? await areFriends(viewer.id, image.ownerId) : false;
  return packs.some((pack) => canSeePack(viewer, pack, friend)) ? image : null;
}
