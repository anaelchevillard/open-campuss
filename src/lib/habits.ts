import "server-only";
import { and, count, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { readableDocuments } from "./access";
import { db, schema } from "./db";
import type { User } from "./db/schema";
import { readiness, type Readiness, type ReadinessInput } from "./readiness";
import { computeStreak, DEFAULT_DAILY_GOAL, isQuietHour, parisDay, questDayOf, shiftDay, weekOf, weekStrip, type WeekDay } from "./study-habits";
import { advance, describeQuest, drawQuests, fullDays, type QuestContext, type QuestView } from "./quests";
import { grantXp, levelOfXp, tierBonus, XP } from "./xp";

const { documents, flashcards, quizAttempts, studyDays, subjects, userHabits, dailyQuests, thanks } = schema;

export type HabitSnapshot = { today: number; goal: number; streak: number };


export async function habitSnapshot(userId: string): Promise<HabitSnapshot> {
  const game = await gameSnapshot(userId);
  return { today: game.today, goal: game.goal, streak: game.streak };
}

export type GameSnapshot = HabitSnapshot & {
  best: number;
  xpToday: number;
  xpTotal: number;
  level: ReturnType<typeof levelOfXp>;
  week: WeekDay[];
  vacationUntil: string | null;
  activeToday: boolean;
  /** Jours révisés des 18 dernières semaines, pour la carte de chaleur : jour → fiches et questions. */
  heat: Record<string, number>;
  reminderHour: number | null;
};

// Un an : la carte de chaleur remplit la largeur du panneau avec autant de semaines qu'il y a de place (lib/heat-grid.ts)
const HEAT_DAYS = 53 * 7;

/** Tout l'état du jeu d'une personne. Privé : seule la personne le voit. */
export async function gameSnapshot(userId: string): Promise<GameSnapshot> {
  const [days, [habits]] = await Promise.all([
    db.select({ day: studyDays.day, cards: studyDays.cards, questions: studyDays.questions, xp: studyDays.xp }).from(studyDays).where(eq(studyDays.userId, userId)),
    db.select().from(userHabits).where(eq(userHabits.userId, userId)),
  ]);
  const today = parisDay(new Date());
  const row = days.find((d) => d.day === today);
  const active = days.filter((d) => d.cards + d.questions > 0).map((d) => d.day);
  const { streak, activeToday } = computeStreak(active, today, habits?.vacationUntil);
  const xpTotal = days.reduce((sum, d) => sum + d.xp, 0);
  const since = shiftDay(today, -HEAT_DAYS);
  const heat = Object.fromEntries(days.filter((d) => d.day > since).map((d) => [d.day, d.cards + d.questions]));
  return {
    today: (row?.cards ?? 0) + (row?.questions ?? 0), goal: habits?.dailyGoal ?? DEFAULT_DAILY_GOAL, streak,
    best: Math.max(habits?.bestStreak ?? 0, streak), xpToday: row?.xp ?? 0, xpTotal, level: levelOfXp(xpTotal),
    week: weekStrip(active, today, habits?.vacationUntil), vacationUntil: habits?.vacationUntil ?? null, activeToday, heat,
    reminderHour: habits?.reminderHour ?? null,
  };
}

/** Ce qui revient demain : les fiches dues d'ici la fin de la journée de demain (à Paris, à peu près). */
export async function dueTomorrow(userId: string) {
  const end = new Date(Date.now() + 2 * 86_400_000);
  end.setUTCHours(23, 0, 0, 0);
  const [row] = await db.select({ n: count() }).from(flashcards).where(and(eq(flashcards.userId, userId), lte(flashcards.dueAt, end), isNull(flashcards.suspendedAt)));
  return row.n;
}

export type StudyGain = { cards?: number; questions?: number; correct?: number; seconds?: number; xp?: number };

/** Inscrit une révision dans la journée. L'XP est plafonnée ; ce qui a été réellement gagné est renvoyé. */
export async function recordStudy(userId: string, gain: StudyGain) {
  const day = parisDay(new Date());
  const [current] = await db.select({ xp: studyDays.xp, cards: studyDays.cards, questions: studyDays.questions }).from(studyDays).where(and(eq(studyDays.userId, userId), eq(studyDays.day, day)));
  const xp = grantXp(current?.xp ?? 0, gain.xp ?? 0);
  const values = { cards: gain.cards ?? 0, questions: gain.questions ?? 0, correct: gain.correct ?? 0, seconds: Math.min(3600, gain.seconds ?? 0), xp };
  await db.insert(studyDays).values({ userId, day, ...values }).onConflictDoUpdate({
    target: [studyDays.userId, studyDays.day],
    set: {
      cards: sql`${studyDays.cards} + ${values.cards}`, questions: sql`${studyDays.questions} + ${values.questions}`,
      correct: sql`${studyDays.correct} + ${values.correct}`, seconds: sql`${studyDays.seconds} + ${values.seconds}`, xp: sql`${studyDays.xp} + ${values.xp}`,
    },
  });
  const before = (current?.cards ?? 0) + (current?.questions ?? 0);
  return { xp, before, after: before + values.cards + values.questions };
}

/** Compatibilité : une fiche révisée, sans XP. */
export async function recordReview(userId: string) {
  await recordStudy(userId, { cards: 1 });
}

/** La meilleure série ne baisse jamais. */
export async function keepBestStreak(userId: string, streak: number) {
  await db.insert(userHabits).values({ userId, bestStreak: streak }).onConflictDoUpdate({ target: userHabits.userId, set: { bestStreak: sql`greatest(${userHabits.bestStreak}, ${streak})` } });
}

/** Objectif du jour franchi par ce geste : +15 XP, sauf la nuit. */
export async function goalBonus(userId: string, before: number, after: number) {
  const [habits] = await db.select({ goal: userHabits.dailyGoal }).from(userHabits).where(eq(userHabits.userId, userId));
  const goal = habits?.goal ?? DEFAULT_DAILY_GOAL;
  if (before >= goal || after < goal) return { reached: false, xp: 0 };
  const xp = isQuietHour(new Date()) ? 0 : (await recordStudy(userId, { xp: XP.goal })).xp;
  await progressQuests(userId, (quest) => quest === "goal", 1);
  return { reached: true, xp };
}

// --- Quêtes

async function questContext(user: Pick<User, "id" | "role" | "programId" | "level">, day: string): Promise<QuestContext> {
  const now = new Date();
  const [scores, [exam], [read], [due]] = await Promise.all([
    subjectScores(user).catch(() => []),
    user.programId ? db.select({ subjectId: schema.exams.subjectId, at: schema.exams.at }).from(schema.exams).innerJoin(subjects, eq(schema.exams.subjectId, subjects.id))
      .where(and(eq(subjects.programId, user.programId), eq(subjects.level, user.level ?? 1), gte(schema.exams.at, now))).orderBy(schema.exams.at).limit(1) : [],
    db.select({ n: count() }).from(schema.readingProgress).where(eq(schema.readingProgress.userId, user.id)),
    db.select({ n: count() }).from(flashcards).where(and(eq(flashcards.userId, user.id), lte(flashcards.dueAt, now), isNull(flashcards.suspendedAt))),
  ]);
  const known = scores.filter((s) => s.result.known).sort((a, b) => (a.result.known && b.result.known ? a.result.percent - b.result.percent : 0));
  const weakest = known[0] ?? scores[0] ?? null;
  return {
    hasSession: due.n > 0 || read.n > 0, weakest: weakest ? { id: weakest.id } : null, day, hasReadCourse: read.n > 0,
    examSoon: exam ? { subjectId: exam.subjectId, days: Math.ceil((exam.at.getTime() - now.getTime()) / 86_400_000) } : null,
  };
}

/** Les trois quêtes du jour, tirées à la première visite après 4 h, puis figées pour la journée. */
export async function questsOf(user: Pick<User, "id" | "role" | "programId" | "level">): Promise<QuestView[]> {
  const day = questDayOf(new Date());
  let rows = await db.select().from(dailyQuests).where(and(eq(dailyQuests.userId, user.id), eq(dailyQuests.day, day)));
  if (!rows.length) {
    const drawn = drawQuests(await questContext(user, day));
    await db.insert(dailyQuests).values(drawn.map((q) => ({ userId: user.id, day, quest: q.quest, target: q.target }))).onConflictDoNothing();
    rows = await db.select().from(dailyQuests).where(and(eq(dailyQuests.userId, user.id), eq(dailyQuests.day, day)));
  }
  // « Remercier un cours » se lit dans la table des remerciements : le geste se fait sur la page du cours
  const thanksQuest = rows.find((row) => row.quest === "thanks" && !row.doneAt);
  if (thanksQuest) {
    const start = new Date(`${day}T04:00:00+01:00`);
    const [given] = await db.select({ n: count() }).from(thanks).where(and(eq(thanks.userId, user.id), gte(thanks.at, start)));
    if (given.n > 0) await progressQuests(user.id, (quest) => quest === "thanks", 1);
    if (given.n > 0) rows = await db.select().from(dailyQuests).where(and(eq(dailyQuests.userId, user.id), eq(dailyQuests.day, day)));
  }
  const ids = rows.flatMap((row) => { const id = Number(row.quest.split(":")[1]); return id ? [id] : []; });
  const names = ids.length ? await db.select({ id: subjects.id, name: subjects.name, shortName: subjects.shortName }).from(subjects).where(inArray(subjects.id, ids)) : [];
  const order = ["session", "goal"];
  return rows.sort((a, b) => Number(order.includes(b.quest)) - Number(order.includes(a.quest)) || Number(a.quest === "make" || a.quest === "thanks") - Number(b.quest === "make" || b.quest === "thanks"))
    .map((row) => ({ quest: row.quest, progress: row.progress, target: row.target, done: Boolean(row.doneAt), ...describeQuest(row.quest, (id) => { const s = names.find((n) => n.id === id); return s ? s.shortName || s.name : undefined; }) }));
}

/** Fait avancer les quêtes du jour qui correspondent ; rien la nuit. Renvoie l'XP d'un palier franchi. */
export async function progressQuests(userId: string, match: (quest: string) => boolean, by: number) {
  if (isQuietHour(new Date()) || by <= 0) return { completed: [] as string[], tierXp: 0 };
  const day = questDayOf(new Date());
  const rows = await db.select().from(dailyQuests).where(and(eq(dailyQuests.userId, userId), eq(dailyQuests.day, day)));
  const completed: string[] = [];
  for (const row of rows) {
    if (row.doneAt || !match(row.quest)) continue;
    const progress = advance(row.progress, by, row.target);
    const done = progress >= row.target;
    await db.update(dailyQuests).set({ progress, doneAt: done ? new Date() : null }).where(and(eq(dailyQuests.userId, userId), eq(dailyQuests.day, day), eq(dailyQuests.quest, row.quest)));
    if (done) completed.push(row.quest);
  }
  let tierXp = 0;
  if (completed.length) {
    const week = await db.select({ day: dailyQuests.day, doneAt: dailyQuests.doneAt }).from(dailyQuests).where(and(eq(dailyQuests.userId, userId), gte(dailyQuests.day, weekOf(day))));
    const after = fullDays(week);
    const today = week.filter((row) => row.day === day);
    const todayFull = today.length > 0 && today.every((row) => row.doneAt);
    if (todayFull) {
      const bonus = tierBonus(after - 1, after);
      if (bonus) tierXp = (await recordStudy(userId, { xp: bonus })).xp;
    }
  }
  return { completed, tierXp };
}

/** Jours de la semaine où les trois quêtes sont faites, pour les paliers. */
export async function weeklyQuestDays(userId: string) {
  const day = questDayOf(new Date());
  const week = await db.select({ day: dailyQuests.day, doneAt: dailyQuests.doneAt }).from(dailyQuests).where(and(eq(dailyQuests.userId, userId), gte(dailyQuests.day, weekOf(day))));
  return fullDays(week);
}

export const seasonDismissedBy = async (userId: string) => (await db.select({ season: userHabits.seasonDismissed }).from(userHabits).where(eq(userHabits.userId, userId)))[0]?.season ?? null;

/** Ce que la personne a fait, matière par matière. Une fiche compte par son document : sans document ou sans matière, elle ne pèse nulle part. */
export async function readinessBySubject(user: Pick<User, "id" | "role" | "programId">, subjectIds?: number[]) {
  if (subjectIds && !subjectIds.length) return new Map<number, Readiness>();
  const only = subjectIds ? inArray(documents.subjectId, subjectIds) : isNotNull(documents.subjectId);
  // Quiz : le nombre par matière et la dernière tentative de chaque quiz tenté, calculés par la base (et non plus la
  // liste de tous les quiz lisibles de la licence, puis une recherche de tentatives sur toute cette liste)
  const quizReady = and(readableDocuments(user), eq(documents.quizStatus, "ready"), only);
  const [cards, quizCounts, last] = await Promise.all([
    db.select({ subjectId: documents.subjectId, intervalDays: flashcards.intervalDays, lastReviewedAt: flashcards.lastReviewedAt }).from(flashcards).innerJoin(documents, eq(flashcards.documentId, documents.id)).where(and(eq(flashcards.userId, user.id), only)),
    db.select({ subjectId: documents.subjectId, n: count() }).from(documents).where(quizReady).groupBy(documents.subjectId),
    db.selectDistinctOn([quizAttempts.documentId], { documentId: quizAttempts.documentId, subjectId: documents.subjectId, score: quizAttempts.score, total: quizAttempts.total }).from(quizAttempts)
      .innerJoin(documents, eq(quizAttempts.documentId, documents.id))
      .where(and(eq(quizAttempts.userId, user.id), quizReady)).orderBy(quizAttempts.documentId, sql`${quizAttempts.at} desc`),
  ]);
  const inputs = new Map<number, ReadinessInput>();
  const of = (id: number) => { const found = inputs.get(id); if (found) return found; const made: ReadinessInput = { cards: [], tried: [], quizCount: 0 }; inputs.set(id, made); return made; };
  for (const id of subjectIds ?? []) of(id);
  for (const card of cards) of(card.subjectId!).cards.push({ intervalDays: card.intervalDays, reviewed: Boolean(card.lastReviewedAt) });
  // Un quiz jamais tenté, dans une matière sans autre trace, ne doit pas faire apparaître cette matière dans /reviser
  for (const attempt of last) of(attempt.subjectId!).tried.push({ score: attempt.score, total: attempt.total });
  for (const row of quizCounts) {
    const input = inputs.get(row.subjectId!);
    if (input) input.quizCount = row.n;
  }
  return new Map([...inputs].map(([id, input]) => [id, readiness(input)]));
}

/** Les matières où il existe au moins une trace de travail, avec leur nom, pour /reviser. */
export async function subjectScores(user: Pick<User, "id" | "role" | "programId">) {
  const results = await readinessBySubject(user);
  if (!results.size) return [];
  const names = await db.select({ id: subjects.id, name: subjects.name }).from(subjects).where(inArray(subjects.id, [...results.keys()]));
  return names.map((subject) => ({ ...subject, result: results.get(subject.id)! }))
    .sort((a, b) => Number(b.result.known) - Number(a.result.known) || (b.result.known && a.result.known ? b.result.percent - a.result.percent : 0) || a.name.localeCompare(b.name, "fr"));
}
