"use server";

import { trackEvent } from "@/lib/product-events";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { canRead } from "@/lib/access-server";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";

const { documents, favorites, readingProgress } = schema;

const uuid = z.uuid();

async function readable(rawId: unknown) {
  const user = await requireUser();
  const [doc] = await db.select().from(documents).where(eq(documents.id, uuid.parse(rawId)));
  if (!doc || !(await canRead(user, doc))) throw new Error("accès refusé");
  return { user, doc };
}

export async function toggleFavorite(rawId: string): Promise<boolean> {
  const { user, doc } = await readable(rawId);
  const removed = await db.delete(favorites).where(and(eq(favorites.userId, user.id), eq(favorites.documentId, doc.id))).returning();
  if (!removed.length) await db.insert(favorites).values({ userId: user.id, documentId: doc.id }).onConflictDoNothing();
  return !removed.length;
}

export async function saveProgress(rawId: string, percent: number) {
  const { user, doc } = await readable(rawId);
  const value = Math.min(100, Math.max(0, Math.round(percent)));
  const [row] = await db.insert(readingProgress).values({ userId: user.id, documentId: doc.id, percent: value })
    .onConflictDoUpdate({ target: [readingProgress.userId, readingProgress.documentId], set: { percent: value, updatedAt: new Date() } })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });
  // Première ouverture de ce cours par cette personne (la ligne vient d'être créée)
  if (row?.inserted) await trackEvent("doc_read", user);
}
