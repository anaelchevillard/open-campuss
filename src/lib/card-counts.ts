import "server-only";
import { and, count, eq, isNull, lte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const { flashcards } = schema;

export type CardCounts = { total: number; due: number };

/** Mes fiches et celles à revoir maintenant (même calcul que la pastille de Réviser : échéance passée, pas de côté). */
export async function cardCounts(userId: string, now = new Date()): Promise<CardCounts> {
  const [row] = await db.select({
    total: count(),
    due: sql<number>`count(*) filter (where ${and(lte(flashcards.dueAt, now), isNull(flashcards.suspendedAt))})::int`,
  }).from(flashcards).where(eq(flashcards.userId, userId));
  return { total: row?.total ?? 0, due: Number(row?.due ?? 0) };
}
