import "server-only";
import { and, count, countDistinct, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db, schema } from "./db";
import type { User, UserProfile } from "./db/schema";
import { featureOn, getSetting } from "./site-settings";
import { authorImpact } from "./site-stats";
import { TtlCache } from "./ttl-cache";
import { statusLive } from "./name-style";
import type { UnlockContext } from "./unlocks";
import type { EarnedRow } from "./badges";

const { userProfiles, userBadges, documents } = schema;

/** Profils de plusieurs personnes d'un coup, pour `UserName` dans une liste (ligue, classement, amis). Sans les réseaux : ils ne s'affichent que sur le profil. */
export async function profilesOf(ids: string[]): Promise<Map<string, UserProfile>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const rows = await db.select().from(userProfiles).where(inArray(userProfiles.userId, unique));
  return new Map(rows.map((row) => [row.userId, { ...row, socials: null }]));
}

export async function profileOf(userId: string): Promise<UserProfile | null> {
  const [row] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
  return row ?? null;
}

/** Badges obtenus et non retirés (anciens identifiants compris). */
export async function badgeRowsOf(userId: string): Promise<EarnedRow[]> {
  return db.select({ badge: userBadges.badge, earnedAt: userBadges.earnedAt, grantedBy: userBadges.grantedBy }).from(userBadges)
    .where(and(eq(userBadges.userId, userId), isNull(userBadges.revokedAt)));
}

/** Statut visible : pas expiré, et sans mot interdit par la modération. */
export async function visibleStatus(profile: UserProfile | null) {
  const status = profile?.status;
  if (!statusLive(status)) return null;
  const banned = await getSetting("moderation.bannedWords");
  const lower = status!.text.toLowerCase();
  return banned.some((word) => word && lower.includes(word.toLowerCase())) ? null : status!;
}

/** Tout ce qu'il faut pour savoir ce que la personne a débloqué. */
export async function unlockContextOf(user: Pick<User, "id" | "role" | "favoriteSubjectId">, numbers: { credits: number; published: number; bestStreak: number; badges: Set<string> }): Promise<UnlockContext> {
  const [[trophies], grants, bannerImages, request] = await Promise.all([
    db.select({ n: count() }).from(schema.seasonTrophies).where(eq(schema.seasonTrophies.userId, user.id)),
    db.select({ item: schema.userUnlocks.item }).from(schema.userUnlocks).where(eq(schema.userUnlocks.userId, user.id)),
    featureOn("bannerImages"),
    user.favoriteSubjectId ? db.select({ id: schema.courseRequests.id }).from(schema.courseRequests)
      .where(and(eq(schema.courseRequests.subjectId, user.favoriteSubjectId), isNull(schema.courseRequests.answeredAt), isNull(schema.courseRequests.mergedInto))).limit(1) : Promise.resolve([]),
  ]);
  return {
    ...numbers, moderator: user.role === "delegate" || user.role === "admin", seasonTrophies: trophies.n,
    grants: new Set(grants.map((g) => g.item)), bannerImages,
    requestHref: request.length ? `/demandes?matiere=${user.favoriteSubjectId}` : undefined,
  };
}

// ---------- Impact ----------

const THRESHOLD = 5;
const atLeast = (n: number) => (n >= THRESHOLD ? n : null);
const impactCache = new TtlCache<Impact>(500, 10 * 60_000);
export type Impact = { readers: number | null; thanks: number | null; revised: number | null; favorites: number | null; cards: number | null };

/** Impact agrégé des cours d'une personne : chaque chiffre vaut null sous 5, pour qu'on ne devine pas qui. */
export async function impactOf(userId: string): Promise<Impact> {
  const cached = impactCache.get(userId);
  if (cached) return cached;
  const mine = and(eq(documents.createdBy, userId), eq(documents.published, true), isNull(documents.deletedAt));
  const [base, [revised], [favorites], [cards]] = await Promise.all([
    authorImpact(userId),
    db.select({ n: count() }).from(schema.revised).innerJoin(documents, eq(schema.revised.documentId, documents.id)).where(and(mine, sql`${schema.revised.userId} <> ${userId}`)),
    db.select({ n: countDistinct(schema.favorites.userId) }).from(schema.favorites).innerJoin(documents, eq(schema.favorites.documentId, documents.id)).where(and(mine, sql`${schema.favorites.userId} <> ${userId}`)),
    db.select({ n: count() }).from(schema.flashcards).innerJoin(documents, eq(schema.flashcards.documentId, documents.id)).where(and(mine, sql`${schema.flashcards.userId} <> ${userId}`)),
  ]);
  const impact = { readers: base.readers, thanks: base.thanks, revised: atLeast(revised.n), favorites: atLeast(favorites.n), cards: atLeast(cards.n) };
  impactCache.set(userId, impact);
  return impact;
}

// ---------- Activité ----------

export type ActivityLayer = Map<string, number>;
const dayKey = (date: Date) => date.toISOString().slice(0, 10);
const activityCache = new TtlCache<{ contributions: [string, number][]; study: [string, number][] }>(500, 10 * 60_000);

/** Un an d'activité, jour par jour : publications et corrections acceptées ; révision (fiches et questions) à part. */
export async function activityOf(userId: string) {
  const cached = activityCache.get(userId);
  if (cached) return { contributions: new Map(cached.contributions), study: new Map(cached.study) };
  const since = new Date(Date.now() - 371 * 86_400_000);
  const [published, revisions, study] = await Promise.all([
    db.select({ at: documents.publishedAt }).from(documents).where(and(eq(documents.createdBy, userId), eq(documents.published, true), isNull(documents.deletedAt), isNotNull(documents.publishedAt), gte(documents.publishedAt, since))),
    db.select({ at: schema.revisions.createdAt }).from(schema.revisions).where(and(eq(schema.revisions.authorId, userId), eq(schema.revisions.status, "accepted"), gte(schema.revisions.createdAt, since))),
    db.select({ day: schema.studyDays.day, n: sql<number>`(${schema.studyDays.cards} + ${schema.studyDays.questions})::int` }).from(schema.studyDays).where(and(eq(schema.studyDays.userId, userId), gte(schema.studyDays.day, dayKey(since)))),
  ]);
  const contributions: ActivityLayer = new Map();
  for (const row of [...published, ...revisions]) if (row.at) contributions.set(dayKey(row.at), (contributions.get(dayKey(row.at)) ?? 0) + 1);
  const studyMap: ActivityLayer = new Map(study.filter((row) => row.n > 0).map((row) => [row.day, row.n]));
  activityCache.set(userId, { contributions: [...contributions], study: [...studyMap] });
  return { contributions, study: studyMap };
}

export function forgetProfileCaches(userId: string) {
  impactCache.delete(userId);
  activityCache.delete(userId);
}
