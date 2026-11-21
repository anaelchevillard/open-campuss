import "server-only";
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { readableDocuments } from "@/lib/access";
import { countsByKey, type CategoryCounts } from "@/lib/category-counts";
import { docCardFields } from "@/lib/catalog";
import { db, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { cardStats } from "@/lib/doc-stats";

const { documents, favorites, friendships, quizDuels, quizDuelScores, readingProgress, revised, revisionMembers, studyGroupMembers, subjects } = schema;

/** Les trois dernières lectures, avec leur avancement. */
export async function lastReads(user: User) {
  return db.select({ ...docCardFields, ...cardStats, percent: readingProgress.percent, subject: subjects.shortName, subjectShort: subjects.shortName }).from(readingProgress)
    .innerJoin(documents, eq(readingProgress.documentId, documents.id)).leftJoin(subjects, eq(documents.subjectId, subjects.id))
    .where(and(eq(readingProgress.userId, user.id), readableDocuments(user), isNull(documents.deletedAt), sql`${readingProgress.percent} < 97`))
    .orderBy(desc(readingProgress.updatedAt)).limit(3);
}

/** Tuiles de matières : nombre de cours lisibles et cours marqués révisés, par matière. */
export async function subjectTiles(user: User, subjectIds: number[]) {
  if (!subjectIds.length) return { counts: new Map<number, CategoryCounts>(), done: new Map<number, number>() };
  const [counts, done] = await Promise.all([
    // Par type, pour dire « 3 CM · 1 fiche » et non « 4 cours »
    db.select({ subject: documents.subjectId, category: documents.category, n: count() }).from(documents).where(and(readableDocuments(user), inArray(documents.subjectId, subjectIds))).groupBy(documents.subjectId, documents.category),
    db.select({ subject: documents.subjectId, n: count() }).from(revised).innerJoin(documents, eq(revised.documentId, documents.id))
      .where(and(eq(revised.userId, user.id), readableDocuments(user), inArray(documents.subjectId, subjectIds))).groupBy(documents.subjectId),
  ]);
  return { counts: countsByKey(counts.map((c) => ({ key: c.subject!, category: c.category, n: c.n }))), done: new Map(done.map((c) => [c.subject!, c.n])) };
}

/** Les cours des matières du semestre : les favoris (segment) ou les plus récents (Nouveautés). */
export async function semesterDocs(user: User, subjectIds: number[], only: "favorites" | "recent") {
  if (!subjectIds.length) return [];
  const query = db.select({ ...docCardFields, ...cardStats, subject: subjects.shortName, subjectShort: subjects.shortName }).from(documents).leftJoin(subjects, eq(documents.subjectId, subjects.id));
  const where = and(readableDocuments(user), isNull(documents.deletedAt), inArray(documents.subjectId, subjectIds));
  if (only === "favorites") return query.innerJoin(favorites, and(eq(favorites.documentId, documents.id), eq(favorites.userId, user.id))).where(where).orderBy(desc(favorites.at)).limit(6);
  // Un sujet de partiel n'est pas un cours ; il vit dans Réviser › Partiels
  return query.where(and(where, eq(documents.published, true), ne(documents.category, "partiel"))).orderBy(desc(sql`coalesce(${documents.publishedAt}, ${documents.updatedAt})`)).limit(6);
}

export type TurnItem = { key: string; label: string; href: string; count?: number };

/** Ce qui attend une réponse, rien d'autre (pas d'activité des amis à l'accueil). */
export async function yourTurn(user: User): Promise<TurnItem[]> {
  const now = new Date();
  const [[friends], [groups], [spaces], duels, toFix] = await Promise.all([
    db.select({ n: count() }).from(friendships).where(and(eq(friendships.addresseeId, user.id), eq(friendships.status, "pending"))),
    db.select({ n: count() }).from(studyGroupMembers).where(and(eq(studyGroupMembers.userId, user.id), eq(studyGroupMembers.status, "pending"))),
    db.select({ n: count() }).from(revisionMembers).where(and(eq(revisionMembers.userId, user.id), eq(revisionMembers.status, "pending"))),
    db.select({ id: quizDuels.id, title: documents.title }).from(quizDuels).innerJoin(documents, eq(quizDuels.documentId, documents.id))
      .leftJoin(quizDuelScores, and(eq(quizDuelScores.duelId, quizDuels.id), eq(quizDuelScores.userId, user.id)))
      .where(and(eq(quizDuels.invitedId, user.id), gt(quizDuels.expiresAt, now), isNull(quizDuelScores.userId))).orderBy(asc(quizDuels.expiresAt)).limit(3),
    db.select({ id: documents.id, title: documents.title }).from(documents)
      .where(and(eq(documents.createdBy, user.id), eq(documents.published, false), eq(documents.reviewRequested, false), isNotNull(documents.reviewNote), isNull(documents.deletedAt))).limit(3),
  ]);
  const items: TurnItem[] = [];
  if (friends.n) items.push({ key: "friends", label: friends.n > 1 ? "Demandes d’ami" : "Demande d’ami", href: "/amis", count: friends.n });
  if (groups.n + spaces.n) items.push({ key: "groups", label: "Invitations à réviser", href: "/reviser/ensemble", count: groups.n + spaces.n });
  for (const duel of duels) items.push({ key: `duel-${duel.id}`, label: `Défi : ${duel.title || "Sans titre"}`, href: `/defi/${duel.id}` });
  for (const doc of toFix) items.push({ key: `fix-${doc.id}`, label: `À corriger : ${doc.title || "Sans titre"}`, href: `/editer/${doc.id}` });
  return items;
}

/** Le prochain partiel de l'année affichée, s'il tombe dans les 30 jours. */
/** « 2 demandes dans tes matières » : pour qui a déjà publié. */
export async function requestsInMySubjects(user: User) {
  const mine = await db.selectDistinct({ id: documents.subjectId }).from(documents).where(and(eq(documents.createdBy, user.id), eq(documents.published, true), isNull(documents.deletedAt)));
  const ids = mine.flatMap((r) => (r.id ? [r.id] : []));
  if (!ids.length) return 0;
  const [row] = await db.select({ n: count() }).from(schema.courseRequests)
    .where(and(inArray(schema.courseRequests.subjectId, ids), isNull(schema.courseRequests.answeredAt), isNull(schema.courseRequests.mergedInto), or(isNull(schema.courseRequests.authorId), sql`${schema.courseRequests.authorId} <> ${user.id}`)));
  return row.n;
}

export const favoriteIds = async (userId: string) => new Set((await db.select({ id: favorites.documentId }).from(favorites).where(eq(favorites.userId, userId))).map((f) => f.id));
