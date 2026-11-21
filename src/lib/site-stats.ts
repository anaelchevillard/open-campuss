import "server-only";
import { and, count, countDistinct, eq, gte, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { categoryCountsLabel, countByCategory } from "@/lib/category-counts";
import { db, schema } from "@/lib/db";
import { POINTS, POINTS_PER_THANK } from "@/lib/gamification";
import { TtlCache } from "@/lib/ttl-cache";

/** Chiffres agrégés du site, de l'auteur et de l'administration. */
const { documents, docAuthors, users, thanks, readingProgress, documentRatings } = schema;
const live = and(eq(documents.published, true), isNull(documents.deletedAt));

// Sous ce seuil, un chiffre d'impact pourrait désigner une personne : il n'est pas affiché
export const IMPACT_THRESHOLD = 5;
export const atLeast = (n: number) => (n >= IMPACT_THRESHOLD ? n : null);

const DAY = 86_400_000;
// Les chiffres bougent lentement : dix minutes de cache suffisent, et une action de l'auteur les oublie
const cache = new TtlCache<unknown>(500, 10 * 60_000);
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as T | undefined;
  if (hit !== undefined) return hit;
  const value = await load();
  cache.set(key, value);
  return value;
}

/** À appeler quand un document de l'auteur change d'état : ses chiffres se recalculent au prochain affichage. */
export function forgetAuthorStats(userId: string) {
  cache.delete(`author:${userId}`);
  cache.delete(`impact:${userId}`);
}

/** Auteur ou coauteur : les deux voient le cours dans leurs chiffres. */
const authoredBy = (userId: string) => or(eq(documents.createdBy, userId), sql`exists (select 1 from ${docAuthors} where ${docAuthors.documentId} = ${documents.id} and ${docAuthors.userId} = ${userId})`);
/** Un lecteur n'est ni l'auteur ni un coauteur du cours. */
const someoneElse = and(sql`${readingProgress.userId} is distinct from ${documents.createdBy}`, sql`not exists (select 1 from ${docAuthors} where ${docAuthors.documentId} = ${documents.id} and ${docAuthors.userId} = ${readingProgress.userId})`);

/** Premier instant du mois en cours, heure de Paris. */
export function monthStart(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now).map((p) => [p.type, p.value]));
  const elapsed = (Number(parts.day) - 1) * DAY + Number(parts.hour) * 3_600_000 + Number(parts.minute) * 60_000 + Number(parts.second) * 1000;
  return new Date(Math.floor((now.getTime() - elapsed) / 1000) * 1000);
}

export function siteTotals() {
  return cached("site", async () => {
    const [[docs], [people], [programs]] = await Promise.all([
      db.select({ n: count() }).from(documents).where(live),
      db.select({ n: count() }).from(users).where(eq(users.status, "active")),
      db.select({ n: count() }).from(schema.programs).where(eq(schema.programs.active, true)),
    ]);
    return { documents: docs.n, students: people.n, programs: programs.n };
  });
}

export type AuthorStats = {
  published: number; drafts: number; pending: number; toFix: number;
  /** Les publications par type (« 3 CM · 1 fiche ») */
  publishedLabel: string;
  /** Lecteurs distincts des 7 derniers jours, et des 7 jours d'avant */
  readersWeek: number; readersPrevWeek: number;
  ratingAvg: number | null; ratingCount: number;
  /** Crédits gagnés depuis le 1er du mois : publications et mercis reçus */
  creditsMonth: number;
};

export function authorStats(userId: string): Promise<AuthorStats> {
  return cached(`author:${userId}`, async () => {
    const now = Date.now();
    const mine = and(eq(documents.createdBy, userId), isNull(documents.deletedAt));
    const myLive = and(authoredBy(userId), live);
    const since = monthStart(new Date(now));
    const readersBetween = (from: number, to: number) => db.select({ n: countDistinct(readingProgress.userId) }).from(readingProgress).innerJoin(documents, eq(readingProgress.documentId, documents.id))
      .where(and(myLive, someoneElse, gte(readingProgress.updatedAt, new Date(from)), lt(readingProgress.updatedAt, new Date(to))));
    const toFix = isNotNull(documents.reviewNote);
    const [states, [week], [prev], [rating], monthDocs, [monthThanks], kinds] = await Promise.all([
      db.select({ published: documents.published, reviewRequested: documents.reviewRequested, toFix: toFix.mapWith(Boolean), n: count() }).from(documents).where(mine).groupBy(documents.published, documents.reviewRequested, toFix),
      readersBetween(now - 7 * DAY, now + DAY),
      readersBetween(now - 14 * DAY, now - 7 * DAY),
      db.select({ avg: sql<number | null>`avg(${documentRatings.stars})::float8`, n: count() }).from(documentRatings).innerJoin(documents, eq(documentRatings.documentId, documents.id)).where(and(myLive, sql`${documentRatings.userId} <> ${userId}`)),
      db.select({ category: documents.category }).from(documents).where(and(myLive, gte(documents.publishedAt, since))),
      db.select({ n: count() }).from(thanks).innerJoin(documents, eq(thanks.documentId, documents.id)).where(and(myLive, gte(thanks.at, since), sql`${thanks.userId} <> ${userId}`)),
      db.select({ category: documents.category, n: count() }).from(documents).where(and(mine, eq(documents.published, true))).groupBy(documents.category),
    ]);
    const sum = (test: (s: (typeof states)[number]) => boolean) => states.filter(test).reduce((total, s) => total + s.n, 0);
    return {
      published: sum((s) => s.published),
      publishedLabel: categoryCountsLabel(countByCategory(kinds), { empty: "Rien de publié" }),
      drafts: sum((s) => !s.published && !s.reviewRequested && !s.toFix),
      pending: sum((s) => !s.published && s.reviewRequested),
      toFix: sum((s) => !s.published && !s.reviewRequested && s.toFix),
      readersWeek: week.n, readersPrevWeek: prev.n,
      ratingAvg: rating.n ? rating.avg : null, ratingCount: rating.n,
      creditsMonth: monthDocs.reduce((total, d) => total + (POINTS[d.category] ?? 0), 0) + monthThanks.n * POINTS_PER_THANK,
    };
  });
}

/** Lecteurs, mercis et note reçus, pour le profil : chaque chiffre vaut null sous 5. */
export function authorImpact(userId: string) {
  return cached(`impact:${userId}`, async () => {
    const mine = and(authoredBy(userId), live);
    const [[readers], [thanked], [rating]] = await Promise.all([
      db.select({ n: countDistinct(readingProgress.userId) }).from(readingProgress).innerJoin(documents, eq(readingProgress.documentId, documents.id)).where(and(mine, someoneElse)),
      db.select({ n: count() }).from(thanks).innerJoin(documents, eq(thanks.documentId, documents.id)).where(and(mine, sql`${thanks.userId} <> ${userId}`)),
      db.select({ avg: sql<number | null>`avg(${documentRatings.stars})::float8`, n: count() }).from(documentRatings).innerJoin(documents, eq(documentRatings.documentId, documents.id)).where(and(mine, sql`${documentRatings.userId} <> ${userId}`)),
    ]);
    return { readers: atLeast(readers.n), thanks: atLeast(thanked.n), ratingAvg: atLeast(rating.n) === null ? null : rating.avg };
  });
}

/** Pour la feuille d'un document : nouveaux lecteurs par semaine (8 semaines), répartition des notes, questions sans réponse. */
export async function documentStats(documentId: string, createdBy: string | null) {
  const since = new Date(Date.now() - 8 * 7 * DAY);
  const week = sql<number>`floor(extract(epoch from (now() - ${readingProgress.createdAt})) / 604800)::int`;
  const [weeks, ratings, questions] = await Promise.all([
    db.select({ week, n: count() }).from(readingProgress)
      .where(and(eq(readingProgress.documentId, documentId), gte(readingProgress.createdAt, since), createdBy ? sql`${readingProgress.userId} <> ${createdBy}` : undefined)).groupBy(week),
    db.select({ stars: documentRatings.stars, n: count() }).from(documentRatings).where(eq(documentRatings.documentId, documentId)).groupBy(documentRatings.stars),
    db.execute<{ id: string; body: string; created_at: Date }>(sql`select q.id, q.body, q.created_at from qa_posts q where q.document_id = ${documentId} and q.parent_id is null and not q.hidden
      and not exists (select 1 from qa_posts r where r.parent_id = q.id and not r.hidden) order by q.created_at desc limit 5`),
  ]);
  // La semaine 0 est la plus récente ; le graphique se lit de gauche (ancienne) à droite (récente)
  const perWeek = Array.from({ length: 8 }, (_, i) => weeks.find((w) => w.week === 7 - i)?.n ?? 0);
  const ratingCount = ratings.reduce((total, r) => total + r.n, 0);
  return {
    perWeek,
    // Une répartition sur trop peu de notes dirait qui a noté quoi
    ratings: atLeast(ratingCount) === null ? null : [1, 2, 3, 4, 5].map((stars) => ratings.find((r) => r.stars === stars)?.n ?? 0),
    ratingCount,
    questions: questions.rows.map((q) => ({ id: q.id, body: q.body.slice(0, 200), createdAt: new Date(q.created_at).toISOString() })),
  };
}

/** Pouls de l'administration : ce qui s'est passé ces 7 derniers jours. */
export function adminPulse() {
  return cached("pulse", async () => {
    const since = new Date(Date.now() - 7 * DAY);
    const [[signups], [published], [pending], [reports], [waiting]] = await Promise.all([
      db.select({ n: count() }).from(users).where(gte(users.createdAt, since)),
      db.select({ n: count() }).from(documents).where(and(live, gte(documents.publishedAt, since))),
      db.select({ n: count() }).from(users).where(eq(users.status, "pending")),
      db.select({ n: count() }).from(schema.reports).where(eq(schema.reports.status, "open")),
      db.select({ n: count() }).from(documents).where(and(eq(documents.reviewRequested, true), isNull(documents.deletedAt))),
    ]);
    return { signups: signups.n, published: published.n, pendingAccounts: pending.n, openReports: reports.n, waitingReview: waiting.n };
  });
}
