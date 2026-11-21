import "server-only";
import { and, count, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { correctionPoints, POINTS_PER_CORRECTION } from "./contribution-rules";
import { bonusDocuments, REQUEST_BONUS } from "./course-request-rules";
import { db, schema } from "./db";
import type { User } from "./db/schema";
import { seasonOf } from "./seasons";
import { forgetShellCounters } from "./shell-cache";
import { BADGES, badgeOf, isEarned, RARITIES, type Rarity, type Stats } from "./badges";
import { badgeRowsOf, unlockContextOf } from "./profile-data";
import { unlocks } from "./unlocks";
import { inSentence } from "@/lib/subject-name";

export { seasonOf };

const { documents, thanks, revised, users, userBadges, reports, subjects, friendships, userHabits, studyDays, quizAttempts, studyGroupMembers, quizDuels, quizDuelScores, annotations, revisionMembers } = schema;

/**
 * Tout se calcule à partir de ce qui a été publié et remercié : aucun compteur à gonfler.
 * Les crédits récompensent seulement un contenu relu par un administrateur, jamais un simple envoi,
 * pour ne pas pousser à déposer des documents sans en avoir le droit.
 */
export const POINTS: Record<string, number> = { cours: 30, fiche: 20, td: 20, partiel: 15, projet: 15 };
export const POINTS_PER_THANK = 5;
/** Parrainage : compté une fois le filleul activé, plafonné pour qu'une suite de comptes jetables ne rapporte rien de plus. */
export const CREDITS_PER_REFERRAL = 5;
export const MAX_REFERRALS_CREDITED = 20;
export { POINTS_PER_CORRECTION, REQUEST_BONUS };

export const LEVELS = [
  { at: 0, name: "Auditeur libre" }, { at: 30, name: "Semestre validé" }, { at: 60, name: "Année validée" },
  { at: 180, name: "Licence validée" }, { at: 300, name: "Master validé" }, { at: 480, name: "Docteur honoris causa" },
];

export function levelOf(credits: number) {
  const index = LEVELS.findLastIndex((level) => credits >= level.at);
  return { ...LEVELS[index], next: LEVELS[index + 1] ?? null };
}

export type { Stats } from "./badges";
export { BADGES, badgeOf, badgeRowIds } from "./badges";

/** Publié et relu : ni un cours en attente de relecture après coup, ni un cours retiré ne rapportent quoi que ce soit. */
const counted = and(eq(documents.published, true), isNull(documents.deletedAt), isNull(documents.postReviewAt), isNull(documents.deletedAt));

/** Calculé, comme le reste : parmi ces documents, ceux qui ont répondu les premiers à une demande. */
async function answeringDocs(requestIds: (string | null)[]) {
  const ids = [...new Set(requestIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Set<string>();
  const rows = await db.select({
    documentId: documents.id, documentAuthor: documents.createdBy, documentSubject: documents.subjectId, requestId: schema.courseRequests.id, requestAuthor: schema.courseRequests.authorId, requestSubject: schema.courseRequests.subjectId, publishedAt: documents.publishedAt,
  }).from(documents).innerJoin(schema.courseRequests, eq(documents.courseRequestId, schema.courseRequests.id)).where(and(counted, inArray(schema.courseRequests.id, ids)));
  return bonusDocuments(rows);
}

/** Co-auteur par une correction acceptée : ce document lui rapporte les points d'une correction, pas ceux d'une création. */
const notCorrector = (userId: string) => sql`not exists (select 1 from ${schema.documentAuthors} da where da.document_id = ${documents.id} and da.user_id = ${userId} and da.role = 'correcteur')`;

/** Modifications acceptées sur les cours des autres, encore en ligne : la base des points de correction et du trophée « Correcteur ». */
export async function acceptedCorrections(userId: string) {
  const [row] = await db.select({ n: count() }).from(schema.revisions).innerJoin(documents, eq(schema.revisions.documentId, documents.id))
    .where(and(eq(schema.revisions.authorId, userId), eq(schema.revisions.status, "accepted"), isNull(documents.deletedAt), sql`${documents.createdBy} is distinct from ${userId}`));
  return row?.n ?? 0;
}

/** Documents publiés dont la personne est auteur ou co-auteur. */
async function authoredDocs(userId: string) {
  const [owned, shared] = await Promise.all([
    db.select({ id: documents.id, category: documents.category, subjectId: documents.subjectId, publishedAt: documents.publishedAt, courseRequestId: documents.courseRequestId }).from(documents).where(and(eq(documents.createdBy, userId), counted)),
    db.select({ id: documents.id, category: documents.category, subjectId: documents.subjectId, publishedAt: documents.publishedAt, courseRequestId: documents.courseRequestId }).from(documents).innerJoin(schema.docAuthors, eq(schema.docAuthors.documentId, documents.id))
      .where(and(eq(schema.docAuthors.userId, userId), counted, notCorrector(userId))),
  ]);
  return [...new Map([...owned, ...shared].map((d) => [d.id, d])).values()];
}

/** Les crédits seuls : pour une signature ou un quota, inutile de recalculer tout le profil. */
export async function creditsOf(userId: string) {
  const docs = await authoredDocs(userId);
  const [received] = docs.length ? await db.select({ n: count() }).from(thanks).where(and(inArray(thanks.documentId, docs.map((d) => d.id)), sql`${thanks.userId} <> ${userId}`)) : [{ n: 0 }];
  // Les ajustements d'un administrateur comptent ici, jamais dans le classement ni les trophées
  const [adjusted] = await db.select({ total: sql<number>`coalesce(sum(${schema.creditAdjustments.delta}), 0)::int` }).from(schema.creditAdjustments).where(eq(schema.creditAdjustments.userId, userId));
  const corrections = await acceptedCorrections(userId);
  return Math.max(0, docs.reduce((sum, doc) => sum + (POINTS[doc.category] ?? 0), 0) + received.n * POINTS_PER_THANK + correctionPoints(corrections) + (adjusted?.total ?? 0));
}

export async function statsOf(user: Pick<User, "id" | "avatarKey" | "bio" | "programId">): Promise<Stats> {
  const docs = await authoredDocs(user.id);
  const ids = docs.map((d) => d.id);
  // Se remercier soi-même est refusé à l'écriture, et exclu ici par sécurité
  const [[received], [given], [read], [accepted], [referred], pioneers, study, corrections] = await Promise.all([
    ids.length ? db.select({ n: count() }).from(thanks).where(and(inArray(thanks.documentId, ids), sql`${thanks.userId} <> ${user.id}`)) : [{ n: 0 }],
    db.select({ n: count() }).from(thanks).where(eq(thanks.userId, user.id)),
    db.select({ n: count() }).from(revised).where(eq(revised.userId, user.id)),
    db.select({ n: count() }).from(reports).where(and(eq(reports.reporterId, user.id), eq(reports.status, "accepted"))),
    db.select({ n: count() }).from(schema.referrals).where(and(eq(schema.referrals.referrerId, user.id), isNotNull(schema.referrals.creditedAt))),
    user.programId ? db.select({ id: users.id }).from(users).where(and(eq(users.programId, user.programId), eq(users.status, "active"))).orderBy(users.createdAt).limit(30) : [],
    studyStats(user.id),
    acceptedCorrections(user.id),
  ]);
  const byCategory: Record<string, number> = {};
  for (const doc of docs) byCategory[doc.category] = (byCategory[doc.category] ?? 0) + 1;
  const answering = await answeringDocs(docs.map((doc) => doc.courseRequestId));
  const credits = docs.reduce((sum, doc) => sum + (POINTS[doc.category] ?? 0) + (answering.has(doc.id) ? REQUEST_BONUS : 0), 0) + received.n * POINTS_PER_THANK + Math.min(referred.n, MAX_REFERRALS_CREDITED) * CREDITS_PER_REFERRAL + correctionPoints(corrections);
  return {
    byCategory, published: docs.length, subjects: new Set(docs.map((d) => d.subjectId)).size, thanksReceived: received.n, thanksGiven: given.n, revised: read.n, reportsAccepted: accepted.n,
    profileComplete: Boolean(user.avatarKey && user.bio.trim()), pioneer: pioneers.some((p) => p.id === user.id), credits, corrections, ...study,
  };
}

/** Ce que la révision, les amis et les défis apportent aux badges : des agrégats, rien de plus. */
async function studyStats(userId: string) {
  const [[habits], [cards], [mock], [friends], [group], [won], [shared]] = await Promise.all([
    db.select({ best: userHabits.bestStreak }).from(userHabits).where(eq(userHabits.userId, userId)),
    db.select({ n: sql<number>`coalesce(sum(${studyDays.cards}), 0)::int` }).from(studyDays).where(eq(studyDays.userId, userId)),
    db.select({ best: sql<number>`coalesce(max(${quizAttempts.score} * 100 / nullif(${quizAttempts.total}, 0)), 0)::int` }).from(quizAttempts).where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.mode, "mock"))),
    db.select({ n: count() }).from(friendships).where(and(eq(friendships.status, "accepted"), sql`(${friendships.requesterId} = ${userId} or ${friendships.addresseeId} = ${userId})`)),
    db.select({ n: sql<number>`coalesce(max(c), 0)::int` }).from(sql`(select count(*) as c from ${studyGroupMembers} m where m.status = 'accepted' and m.group_id in (select group_id from ${studyGroupMembers} where user_id = ${userId} and status = 'accepted') group by m.group_id) g`),
    // Gagner : faire mieux que le lanceur, ou, lanceur, que quelqu'un qui a relevé le défi
    db.select({ n: sql<number>`(
      (select count(*) from ${quizDuelScores} s join ${quizDuels} d on d.id = s.duel_id where s.user_id = ${userId} and s.score * d.challenger_total > d.challenger_score * s.total)
      + (select count(distinct d.id) from ${quizDuels} d join ${quizDuelScores} s on s.duel_id = d.id where d.challenger_id = ${userId} and s.user_id <> ${userId} and d.challenger_score * s.total > s.score * d.challenger_total)
    )::int` }).from(sql`(select 1) one`),
    // Une note posée dans un espace où quelqu'un d'autre a accepté l'invitation
    db.select({ n: count() }).from(annotations).where(and(eq(annotations.authorId, userId), sql`exists (select 1 from ${revisionMembers} rm where rm.space_id = ${annotations.spaceId} and rm.status = 'accepted' and rm.user_id <> ${userId})`)),
  ]);
  return { bestStreak: habits?.best ?? 0, cardsReviewed: cards?.n ?? 0, mockBest: mock?.best ?? 0, friends: friends.n, bigGroup: (group?.n ?? 0) >= 4, duelsWon: won?.n ?? 0, sharedAnnotations: shared.n };
}

/** Un badge obtenu reste acquis, même si un document est retiré plus tard. Un badge acquis sous un ancien identifiant compte. */
export async function syncBadges(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return;
  const stats = await statsOf(user);
  // Un badge retiré par un administrateur garde sa ligne (revokedAt) : ni lui ni ses alias ne sont réinsérés
  const rows = await db.select({ badge: userBadges.badge }).from(userBadges).where(eq(userBadges.userId, userId));
  const known = new Set(rows.map((row) => badgeOf(row.badge)?.id ?? row.badge));
  const earned = BADGES.filter((badge) => !known.has(badge.id) && isEarned(badge, stats)).map((badge) => ({ userId, badge: badge.id }));
  if (earned.length) await db.insert(userBadges).values(earned).onConflictDoNothing();
  // Tout ce qui change les crédits ou les badges passe ici : publication, merci, révision, profil
  forgetShellCounters(userId);
}

/** Classement d'une licence : uniquement les personnes qui l'ont demandé. Avec dates, celui d'une saison ; avec une matière, celui de cette matière. Seul ce qui est partagé compte : pas le parrainage. */
export async function ranking(programId: number, from?: Date, to?: Date, subjectId?: number) {
  const people = await db.select().from(users).where(and(eq(users.programId, programId), eq(users.status, "active"), eq(users.showInRanking, true)));
  if (!people.length) return [];
  const docs = await db.select({ id: documents.id, createdBy: documents.createdBy, category: documents.category, publishedAt: documents.publishedAt, courseRequestId: documents.courseRequestId }).from(documents).where(and(eq(documents.programId, programId), counted, subjectId ? eq(documents.subjectId, subjectId) : undefined));
  const answering = await answeringDocs(docs.map((d) => d.courseRequestId));
  // Un correcteur n'hérite pas des points de création du cours qu'il a corrigé
  const correctors = docs.length ? await db.select({ documentId: schema.documentAuthors.documentId, userId: schema.documentAuthors.userId }).from(schema.documentAuthors).where(and(inArray(schema.documentAuthors.documentId, docs.map((d) => d.id)), eq(schema.documentAuthors.role, "correcteur"))) : [];
  const coauthors = (docs.length ? await db.select().from(schema.docAuthors).where(inArray(schema.docAuthors.documentId, docs.map((d) => d.id))) : [])
    .filter((c) => !correctors.some((k) => k.documentId === c.documentId && k.userId === c.userId));
  const allThanks = docs.length ? await db.select().from(thanks).where(inArray(thanks.documentId, docs.map((d) => d.id))) : [];
  const inWindow = (date: Date | null) => (!from || (date && date >= from)) && (!to || (date && date < to));
  return people.map((person) => {
    const mine = docs.filter((d) => d.createdBy === person.id || coauthors.some((c) => c.documentId === d.id && c.userId === person.id));
    const inPeriod = mine.filter((d) => inWindow(d.publishedAt));
    const merci = allThanks.filter((t) => t.userId !== person.id && mine.some((d) => d.id === t.documentId) && inWindow(t.at)).length;
    return { person, published: inPeriod.length, credits: inPeriod.reduce((sum, d) => sum + (POINTS[d.category] ?? 0) + (answering.has(d.id) ? REQUEST_BONUS : 0), 0) + merci * POINTS_PER_THANK };
  }).filter((row) => row.credits > 0).sort((a, b) => b.credits - a.credits).slice(0, 30);
}

/** Fin de saison : les trois premiers gardent leur trophée dans leur profil, pour toujours. */
export async function archivePastSeasons() {
  const current = seasonOf(new Date());
  const previousEnd = current.start;
  const previous = seasonOf(new Date(previousEnd.getTime() - 86_400_000));
  const programs = await db.select().from(schema.programs);
  for (const program of programs) {
    const [already] = await db.select({ id: schema.seasonTrophies.id }).from(schema.seasonTrophies).where(and(eq(schema.seasonTrophies.season, previous.key), eq(schema.seasonTrophies.programId, program.id))).limit(1);
    if (already) continue;
    const top = await ranking(program.id, previous.start, previousEnd);
    const names = ["Major de promo", "Vice-major", "Troisième de la promo"];
    for (const [index, row] of top.slice(0, 3).entries()) {
      await db.insert(schema.seasonTrophies).values({ season: previous.key, programId: program.id, userId: row.person.id, label: `${names[index]}, ${previous.label}` }).onConflictDoNothing();
    }
  }
}

/** Trophées : ceux en jeu cette saison, qui changent de main, puis ceux gagnés pour de bon. */
export async function trophiesOf(user: Pick<User, "id" | "programId" | "showInRanking">) {
  const out: { name: string; detail: string }[] = [];
  const kept = await db.select().from(schema.seasonTrophies).where(eq(schema.seasonTrophies.userId, user.id));
  for (const trophy of kept) out.push({ name: trophy.label, detail: "Trophée de saison" });
  if (!user.programId || !user.showInRanking) return out;
  const season = seasonOf(new Date());
  const top = await ranking(user.programId, season.start);
  if (top[0]?.person.id === user.id) out.push({ name: "Major de promo", detail: `En tête de la saison ${season.label}` });
  if (top[1]?.person.id === user.id) out.push({ name: "Vice-major", detail: `Deuxième de la saison ${season.label}` });
  const perSubject = await db.select({ subject: documents.subjectId, name: subjects.name, user: documents.createdBy, n: count() }).from(documents)
    .innerJoin(subjects, eq(documents.subjectId, subjects.id))
    .where(and(eq(documents.programId, user.programId), and(eq(documents.published, true), isNull(documents.deletedAt)))).groupBy(documents.subjectId, subjects.name, documents.createdBy);
  for (const row of perSubject) {
    if (row.user !== user.id || row.n < 3) continue;
    if (perSubject.every((other) => other.subject !== row.subject || other.n <= row.n)) out.push({ name: `Référent ${inSentence(row.name)}`, detail: `A publié le plus en ${inSentence(row.name)}` });
  }
  return out;
}

/** Chiffres, badges et déblocages de la personnalisation d'une personne, calculés à chaque fois (rien à gonfler). */
export async function profileStanding(user: Pick<User, "id" | "avatarKey" | "bio" | "programId" | "role" | "favoriteSubjectId">) {
  const [stats, credits, rows] = await Promise.all([statsOf(user), creditsOf(user.id), badgeRowsOf(user.id)]);
  // Les crédits du profil comptent le bonus de demande et le parrainage, ceux de la signature l'ajustement d'un administrateur : on garde le plus favorable
  const total = Math.max(stats.credits, credits);
  const earned = new Set(rows.map((row) => badgeOf(row.badge)?.id).filter((id): id is string => Boolean(id)));
  const ctx = await unlockContextOf(user, { credits: total, published: stats.published, bestStreak: stats.bestStreak, badges: earned });
  const best = rows.reduce<Rarity | null>((top, row) => {
    const badge = badgeOf(row.badge);
    if (!badge) return top;
    const rarity: Rarity = row.grantedBy ? "special" : badge.rarity;
    return !top || RARITIES[rarity].rank > RARITIES[top].rank ? rarity : top;
  }, null);
  return { stats: { ...stats, credits: total }, rows, earned, ctx, unlocked: unlocks(ctx), rarity: best };
}
