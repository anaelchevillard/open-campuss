import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "./db";

const { documentShares, users } = schema;

/** Amis à qui un document est ouvert en lecture (la vérification d'accès, elle, vit dans access-server.ts). */
export async function sharesOf(documentId: string) {
  return db.select({ id: users.id, name: users.name, avatarKey: users.avatarKey }).from(documentShares)
    .innerJoin(users, eq(documentShares.userId, users.id)).where(eq(documentShares.documentId, documentId)).orderBy(asc(users.name));
}

export async function addShare(documentId: string, userId: string, sharedBy: string) {
  const rows = await db.insert(documentShares).values({ documentId, userId, sharedBy }).onConflictDoNothing().returning({ u: documentShares.userId });
  return rows.length > 0;
}

export async function removeShare(documentId: string, userId: string) {
  await db.delete(documentShares).where(and(eq(documentShares.documentId, documentId), eq(documentShares.userId, userId)));
}
