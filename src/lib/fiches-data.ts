import "server-only";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { readableDocuments } from "@/lib/access";
import { db, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { FREE_SCOPE, packScope } from "@/lib/memo-pack-rules";
import { cardStatus, isDue, mastery, memoryStats, RETENTION_DAYS, type CardStatus, type MemoryStats } from "@/lib/memo-stats";

const { flashcards, documents, memoPacks, cardReviews, readingProgress } = schema;

export const FICHES_LIMIT = 2000;

export type BrowserCard = { id: string; front: string; back: string; scope: string; doc: string | null; status: CardStatus; due: boolean };
export type Deck = { scope: string; title: string; stats: MemoryStats; mastery: number; pack: { id: string; friends: boolean; public: boolean; copies: number; removedAt: Date | null } | null };

/** Tout ce que montre la page Fiches : mes fiches, mes paquets (par cours) et leurs chiffres de mémoire. */
export async function fichesOverview(user: Pick<User, "id">, now = new Date()) {
  const [rows, grades, packs] = await Promise.all([
    db.select({ card: flashcards, doc: documents.title }).from(flashcards).leftJoin(documents, eq(flashcards.documentId, documents.id))
      .where(eq(flashcards.userId, user.id)).orderBy(desc(flashcards.createdAt)).limit(FICHES_LIMIT),
    db.select({ grade: cardReviews.grade, cardId: cardReviews.cardId }).from(cardReviews)
      .where(and(eq(cardReviews.userId, user.id), gte(cardReviews.at, new Date(now.getTime() - RETENTION_DAYS * 86_400_000)))),
    db.select().from(memoPacks).where(eq(memoPacks.ownerId, user.id)),
  ]);
  const scopeOfCard = new Map(rows.map(({ card }) => [card.id, packScope(card.documentId)]));
  const byScope = new Map<string, typeof rows>();
  for (const row of rows) {
    const scope = packScope(row.card.documentId);
    byScope.set(scope, [...(byScope.get(scope) ?? []), row]);
  }
  const packOf = new Map(packs.map((p) => [p.scope, p]));
  const decks: Deck[] = [...byScope].map(([scope, list]) => {
    const stats = memoryStats(list.map((r) => r.card), grades.filter((g) => scopeOfCard.get(g.cardId) === scope).map((g) => g.grade), now);
    const pack = packOf.get(scope);
    return {
      scope, title: scope === FREE_SCOPE ? "Fiches libres" : list[0].doc || "Sans titre", stats, mastery: mastery(stats),
      pack: pack ? { id: pack.id, friends: pack.friends, public: pack.public, copies: pack.copies, removedAt: pack.removedAt } : null,
    };
  }).sort((a, b) => (b.stats.due + b.stats.fresh) - (a.stats.due + a.stats.fresh) || b.stats.total - a.stats.total);
  const cards: BrowserCard[] = rows.map(({ card, doc }) => ({
    id: card.id, front: card.front, back: card.back, scope: packScope(card.documentId), doc, status: cardStatus(card), due: isDue(card, now) && cardStatus(card) !== "new",
  }));
  return { cards, decks, stats: memoryStats(rows.map((r) => r.card), grades.map((g) => g.grade), now), truncated: rows.length >= FICHES_LIMIT };
}

/** Les cours lus récemment : une fiche se rattache à un cours sans formulaire à remplir. */
export function recentCourses(user: Pick<User, "id" | "role" | "programId" | "level">, limit = 6) {
  return db.select({ id: documents.id, title: documents.title }).from(readingProgress).innerJoin(documents, eq(readingProgress.documentId, documents.id))
    .where(and(eq(readingProgress.userId, user.id), readableDocuments(user), isNull(documents.deletedAt))).orderBy(desc(readingProgress.updatedAt)).limit(limit);
}
