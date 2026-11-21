import "server-only";
import { and, count, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { checklistSteps, type ChecklistFacts } from "@/lib/checklist";

const { annotations, courseRequests, documents, friendships, readingProgress, studyDays } = schema;

/** Tout se déduit de ce que la personne a vraiment fait : rien à cocher à la main. */
export async function checklistFacts(user: Pick<User, "id" | "programId">): Promise<ChecklistFacts> {
  const mine = user.programId ? eq(documents.programId, user.programId) : sql`true`;
  const [[opened], [highlighted], [cards], [friends], [authored], [asked]] = await Promise.all([
    db.select({ id: documents.id }).from(readingProgress).innerJoin(documents, eq(readingProgress.documentId, documents.id))
      .where(and(eq(readingProgress.userId, user.id), mine, isNull(documents.deletedAt))).orderBy(desc(readingProgress.updatedAt)).limit(1),
    db.select({ n: count() }).from(annotations).where(and(eq(annotations.authorId, user.id), eq(annotations.kind, "hl"))),
    db.select({ n: sql<number>`coalesce(sum(${studyDays.cards}), 0)::int` }).from(studyDays).where(eq(studyDays.userId, user.id)),
    db.select({ n: count() }).from(friendships).where(and(eq(friendships.status, "accepted"), or(eq(friendships.requesterId, user.id), eq(friendships.addresseeId, user.id)))),
    // Un brouillon vide ne partage rien : il faut l'avoir publié ou envoyé à la relecture
    db.select({ n: count() }).from(documents).where(and(eq(documents.createdBy, user.id), isNull(documents.deletedAt), or(eq(documents.published, true), eq(documents.reviewRequested, true)))),
    db.select({ n: count() }).from(courseRequests).where(eq(courseRequests.authorId, user.id)),
  ]);
  return {
    opened: Boolean(opened), lastDocId: opened?.id ?? null, highlighted: highlighted.n > 0, cards: cards.n, friends: friends.n,
    shared: authored.n + asked.n > 0,
  };
}

/** Les étapes, ou rien si la personne a fermé la carte. */
export async function checklistFor(user: User) {
  if (user.prefs.checklistDismissed) return null;
  return checklistSteps(await checklistFacts(user), user.prefs.intent);
}
