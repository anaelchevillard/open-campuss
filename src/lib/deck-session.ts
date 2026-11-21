import "server-only";
import { and, asc, eq, isNull, lte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { FREE_SCOPE } from "@/lib/memo-pack-rules";
import { dueItem } from "@/lib/today-plan";
import type { SessionItem } from "@/lib/today-session";

const { flashcards, documents } = schema;

export const DECK_SESSION_MAX = 100;

/**
 * Séance d'un de mes paquets : ses fiches dues, ou toutes en avance (`ahead`), jamais celles mises de côté.
 * Toujours filtré par la personne : un identifiant de paquet d'autrui ne donne rien.
 */
export async function deckSession(userId: string, scope: string, { ahead = false, now = new Date() } = {}) {
  const rows = await db.select({ card: flashcards, subjectId: documents.subjectId, title: documents.title }).from(flashcards)
    .leftJoin(documents, eq(flashcards.documentId, documents.id))
    .where(and(
      eq(flashcards.userId, userId),
      scope === FREE_SCOPE ? isNull(flashcards.documentId) : eq(flashcards.documentId, scope),
      isNull(flashcards.suspendedAt),
      ahead ? undefined : lte(flashcards.dueAt, now),
    ))
    .orderBy(asc(flashcards.dueAt)).limit(DECK_SESSION_MAX);
  const items: SessionItem[] = rows.map(({ card, subjectId }) => ({ kind: "card", ...dueItem(card, subjectId, now) }));
  const title = scope === FREE_SCOPE ? "Fiches libres" : rows[0]?.title || null;
  return { items, title };
}
