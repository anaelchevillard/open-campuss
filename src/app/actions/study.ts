"use server";

import { trackEvent } from "@/lib/product-events";
import { and, desc, eq, gt, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { examKindOf, examShort } from "@/lib/exam-kind";
import { canRead } from "@/lib/access-server";
import { gameSnapshot, goalBonus, keepBestStreak, progressQuests, recordStudy, type GameSnapshot } from "@/lib/habits";
import { isQuietHour, parisDay } from "@/lib/study-habits";
import { cardXp, quizXp, XP } from "@/lib/xp";
import { audit, requireAdmin, requireModerator, requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { rateHit, rateLimited } from "@/lib/security";
import { nextReview, restoreSnapshot, snapshotOf } from "@/lib/fsrs";
import { parisLocalToDate } from "@/lib/study-habits";
import { forgetShellCounters } from "@/lib/shell-cache";
import type { FormState } from "@/components/action-form";

const { documents, flashcards, quizzes, quizAttempts, exams, subjects, memoDecks, cardReviews } = schema;

const uuid = z.uuid();

const str = (form: FormData, name: string, max = 4000) => { const v = form.get(name); return typeof v === "string" ? v.trim().slice(0, max) : ""; };

async function readable(rawId: unknown) {
  const user = await requireUser();
  const [doc] = await db.select().from(documents).where(eq(documents.id, uuid.parse(rawId)));
  if (!doc || !(await canRead(user, doc))) throw new Error("accès refusé");
  return { user, doc };
}

export async function createCard(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const front = str(form, "front", 1000);
  const back = str(form, "back", 2000);
  if (!front || !back) return { error: "Remplis la question et la réponse." };
  const key = `cards:${user.id}`;
  if (await rateLimited(key, 300, 1440)) return { error: "Trop de fiches créées aujourd’hui." };
  await rateHit(key);
  let documentId: string | null = null;
  if (form.get("document")) documentId = (await readable(form.get("document"))).doc.id;
  await db.insert(flashcards).values({ userId: user.id, documentId, front, back });
  await trackEvent("card_created", user);
  if (documentId) await progressQuests(user.id, (quest) => quest === "make", 1);
  forgetShellCounters(user.id);
  revalidatePath("/reviser");
  revalidatePath("/reviser/fiches");
  return { ok: "Fiche mémo ajoutée." };
}

export type StudyResult = { xp: number; goalReached: boolean; quests: string[]; game: GameSnapshot; /** La note enregistrée, pour « Annuler ». */ reviewId?: number };

const grades = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

/** Après chaque geste : objectif, quêtes, meilleure série. Le navigateur reçoit l'état complet du jeu. */
async function afterStudy(userId: string, gained: { xp: number; before: number; after: number }, quests: (quest: string) => boolean, by: number): Promise<StudyResult> {
  const goal = await goalBonus(userId, gained.before, gained.after);
  const progressed = await progressQuests(userId, quests, by);
  const game = await gameSnapshot(userId);
  await keepBestStreak(userId, game.streak);
  return { xp: gained.xp + goal.xp + progressed.tierXp, goalReached: goal.reached, quests: progressed.completed, game };
}

async function applyGrade(userId: string, card: typeof flashcards.$inferSelect, grade: 0 | 1 | 2 | 3, ms: number): Promise<StudyResult> {
  await db.update(flashcards).set(nextReview(card, grade)).where(eq(flashcards.id, card.id));
  const [review] = await db.insert(cardReviews).values({ userId, cardId: card.id, grade, ms, before: snapshotOf(card) }).returning({ id: cardReviews.id });
  // Une fiche dont la note vient d'être annulée ne rapporte rien à sa nouvelle note : pas de rejeu pour l'XP
  const replayed = await rateLimited(`card-undone:${card.id}`, 1, UNDO_MINUTES * 2);
  const gained = await recordStudy(userId, { cards: replayed ? 0 : 1, xp: replayed ? 0 : cardXp(grade, ms) });
  forgetShellCounters(userId);
  return { ...(await afterStudy(userId, gained, (quest) => quest === "cards" && !replayed, replayed ? 0 : 1)), reviewId: review.id };
}

const UNDO_MINUTES = 15;

/**
 * « Annuler la dernière note » : remet l'état FSRS d'avant, si la note est à la personne, la dernière de la fiche
 * et a moins de 15 minutes. L'XP déjà gagnée reste, mais la note suivante de cette fiche ne rapporte rien.
 */
export async function undoGrade(rawId: number): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const id = z.number().int().positive().parse(rawId);
  const key = `card-undo:${user.id}`;
  if (await rateLimited(key, 200, 1440)) return { error: "Trop d’annulations aujourd’hui." };
  const [review] = await db.select().from(cardReviews).where(and(eq(cardReviews.id, id), eq(cardReviews.userId, user.id), gt(cardReviews.at, new Date(Date.now() - UNDO_MINUTES * 60_000))));
  if (!review?.before) return { error: "Cette note ne peut plus être annulée." };
  const [latest] = await db.select({ id: cardReviews.id }).from(cardReviews).where(eq(cardReviews.cardId, review.cardId)).orderBy(desc(cardReviews.at), desc(cardReviews.id)).limit(1);
  if (latest?.id !== review.id) return { error: "Cette fiche a été notée depuis." };
  await rateHit(key);
  await db.transaction(async (tx) => {
    await tx.update(flashcards).set(restoreSnapshot(review.before!)).where(and(eq(flashcards.id, review.cardId), eq(flashcards.userId, user.id)));
    await tx.delete(cardReviews).where(eq(cardReviews.id, review.id));
  });
  await rateHit(`card-undone:${review.cardId}`);
  forgetShellCounters(user.id);
  return { ok: true };
}

const cardText = z.object({ front: z.string().trim().min(1).max(1000), back: z.string().trim().min(1).max(2000) });

/** Corrige une fiche à soi, sans toucher à son état FSRS. */
export async function updateCard(rawId: string, raw: { front: string; back: string }): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const id = uuid.parse(rawId);
  const text = cardText.safeParse({ front: String(raw?.front ?? ""), back: String(raw?.back ?? "") });
  if (!text.success) return { error: "Remplis la question et la réponse." };
  const key = `cards-edit:${user.id}`;
  if (await rateLimited(key, 600, 1440)) return { error: "Trop de modifications aujourd’hui." };
  await rateHit(key);
  const [card] = await db.update(flashcards).set({ front: text.data.front, back: text.data.back }).where(and(eq(flashcards.id, id), eq(flashcards.userId, user.id))).returning({ id: flashcards.id });
  if (!card) return { error: "Cette fiche n’existe plus." };
  revalidatePath("/reviser/fiches");
  return { ok: true };
}

/** Met une fiche de côté (hors séances, compteurs et rappels) ou la reprend. */
export async function setCardSuspended(rawId: string, suspended: boolean): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const id = uuid.parse(rawId);
  const key = `cards-edit:${user.id}`;
  if (await rateLimited(key, 600, 1440)) return { error: "Trop de modifications aujourd’hui." };
  await rateHit(key);
  const [card] = await db.update(flashcards).set({ suspendedAt: suspended ? new Date() : null }).where(and(eq(flashcards.id, id), eq(flashcards.userId, user.id))).returning({ id: flashcards.id });
  if (!card) return { error: "Cette fiche n’existe plus." };
  forgetShellCounters(user.id);
  revalidatePath("/reviser");
  revalidatePath("/reviser/fiches");
  return { ok: true };
}

/** Note une fiche (FSRS). `ms` : temps passé sur la fiche ; une fiche notée en moins de 1,5 s ne rapporte rien. */
export async function gradeCard(rawId: string, grade: number, ms = 0): Promise<StudyResult | null> {
  const user = await requireUser();
  const [card] = await db.select().from(flashcards).where(and(eq(flashcards.id, uuid.parse(rawId)), eq(flashcards.userId, user.id)));
  if (!card) return null;
  return applyGrade(user.id, card, grades.parse(grade), Math.max(0, Math.min(600_000, Math.round(Number(ms) || 0))));
}

/** Une nouvelle fiche tirée du paquet d'un cours : elle rejoint les fiches de la personne à sa première note. */
export async function gradeNewCard(rawDoc: string, index: number, grade: number, ms = 0): Promise<StudyResult | null> {
  const { user, doc } = await readable(rawDoc);
  const [deck] = await db.select().from(memoDecks).where(eq(memoDecks.documentId, doc.id));
  const source = deck?.cards[z.number().int().min(0).max(500).parse(index)];
  if (!source) return null;
  const [existing] = await db.select().from(flashcards).where(and(eq(flashcards.userId, user.id), eq(flashcards.documentId, doc.id), eq(flashcards.front, source.front.slice(0, 1000))));
  const card = existing ?? (await db.insert(flashcards).values({ userId: user.id, documentId: doc.id, front: source.front.slice(0, 1000), back: source.back.slice(0, 2000) }).returning())[0];
  return applyGrade(user.id, card, grades.parse(grade), Math.max(0, Math.min(600_000, Math.round(Number(ms) || 0))));
}

/** Une question de quiz dans une séance : la correction part une fois le choix fait, jamais avant. */
export async function answerQuestion(rawDoc: string, index: number, choice: number) {
  const { user, doc } = await readable(rawDoc);
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.documentId, doc.id));
  const question = quiz?.questions[z.number().int().min(0).max(50).parse(index)];
  if (!question) throw new Error("question introuvable");
  const correct = question.answer === z.number().int().min(0).max(10).parse(choice);
  const gained = await recordStudy(user.id, { questions: 1, correct: correct ? 1 : 0, xp: correct ? XP.question : 0 });
  const subject = doc.subjectId;
  const result = await afterStudy(user.id, gained, (quest) => quest === "cards" || (subject !== null && quest === `weak:${subject}`), 1);
  return { correct, answer: question.answer, explanation: question.explanation, ...result };
}

/** Fin de séance : +10 XP (sauf la nuit), quête « séance » cochée. */
export async function finishSession(seconds: number, mode: "classic" | "flash" | "mock" = "classic") {
  const user = await requireUser();
  const time = Math.max(0, Math.min(3600, Math.round(Number(seconds) || 0)));
  const quiet = isQuietHour(new Date());
  const gained = await recordStudy(user.id, { seconds: time, xp: quiet || mode !== "classic" ? 0 : XP.session });
  await trackEvent("review_session", user);
  // Pas de revalidatePath : la page de séance se recomposerait et l'écran de fin disparaîtrait
  return afterStudy(user.id, gained, (quest) => quest === "session" && mode === "classic", 1);
}

/** Éclair : 60 s d'association terme ↔ définition sur ses propres fiches. 1 XP par paire, 12 au plus. */
export async function finishFlash(pairs: number, seconds: number) {
  const user = await requireUser();
  const key = `flash:${user.id}`;
  if (await rateLimited(key, 40, 1440)) return null;
  await rateHit(key);
  const n = Math.max(0, Math.min(12, Math.round(Number(pairs) || 0)));
  const gained = await recordStudy(user.id, { seconds: Math.min(90, Math.max(0, Math.round(seconds))), xp: n });
  await trackEvent("review_session", user);
  return afterStudy(user.id, gained, () => false, 0);
}

/** Partiel blanc : questions de plusieurs cours de la matière, corrigées à la fin seulement. */
export async function submitMock(rawSubject: number, answers: { doc: string; index: number; choice: number }[], durationMs: number) {
  const user = await requireUser();
  const subjectId = z.number().int().positive().parse(rawSubject);
  const given = z.array(z.object({ doc: z.uuid(), index: z.number().int().min(0).max(50), choice: z.number().int().min(-1).max(10) })).max(20).parse(answers);
  const corrections: { answer: number; explanation: string; correct: boolean }[] = [];
  const perDoc = new Map<string, { score: number; total: number }>();
  for (const item of given) {
    const { doc } = await readable(item.doc);
    if (doc.subjectId !== subjectId) throw new Error("hors matière");
    const [quiz] = await db.select().from(quizzes).where(eq(quizzes.documentId, doc.id));
    const question = quiz?.questions[item.index];
    if (!question) throw new Error("question introuvable");
    const correct = question.answer === item.choice;
    corrections.push({ answer: question.answer, explanation: question.explanation, correct });
    const entry = perDoc.get(doc.id) ?? { score: 0, total: 0 };
    perDoc.set(doc.id, { score: entry.score + (correct ? 1 : 0), total: entry.total + 1 });
  }
  const duration = Math.max(0, Math.min(7_200_000, Math.round(durationMs)));
  for (const [documentId, part] of perDoc) await db.insert(quizAttempts).values({ userId: user.id, documentId, score: part.score, total: part.total, mode: "mock", durationMs: duration });
  const score = corrections.filter((c) => c.correct).length;
  await trackEvent("mock_exam", user);
  const gained = await recordStudy(user.id, { questions: corrections.length, correct: score, xp: score * XP.question, seconds: Math.round(duration / 1000) });
  const result = await afterStudy(user.id, gained, (quest) => quest === `mock:${subjectId}` || quest === `weak:${subjectId}`, corrections.length);
  return { score, total: corrections.length, corrections, ...result };
}

/** Retirer une fiche depuis la liste : annulable par un toast, d'où le retour de son contenu. */
export async function removeCard(rawId: string) {
  const user = await requireUser();
  const [card] = await db.delete(flashcards).where(and(eq(flashcards.id, uuid.parse(rawId)), eq(flashcards.userId, user.id))).returning();
  forgetShellCounters(user.id);
  revalidatePath("/reviser/fiches");
  return card ? { front: card.front, back: card.back, documentId: card.documentId } : null;
}

export async function restoreCard(card: { front: string; back: string; documentId: string | null }) {
  const user = await requireUser();
  const documentId = card.documentId ? (await readable(card.documentId)).doc.id : null;
  await db.insert(flashcards).values({ userId: user.id, documentId, front: String(card.front).slice(0, 1000), back: String(card.back).slice(0, 2000) });
  revalidatePath("/reviser/fiches");
}

export async function deleteCard(form: FormData) {
  const user = await requireUser();
  await db.delete(flashcards).where(and(eq(flashcards.id, uuid.parse(form.get("id"))), eq(flashcards.userId, user.id)));
  forgetShellCounters(user.id);
  revalidatePath("/reviser");
  revalidatePath("/reviser/fiches");
}

/** Les réponses restent sur le serveur jusqu'à la correction. Le quiz lui-même n'est jamais régénéré ici. */
export async function submitQuiz(rawId: string, answers: number[], durationMs?: number) {
  const { user, doc } = await readable(rawId);
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.documentId, doc.id));
  if (!quiz) throw new Error("quiz introuvable");
  const given = z.array(z.number().int()).max(20).parse(answers);
  const score = quiz.questions.filter((q, i) => given[i] === q.answer).length;
  const total = quiz.questions.length;
  // Un quiz déjà réussi à 100 % aujourd'hui ne rapporte plus d'XP
  const today = new Date(`${parisDay(new Date())}T00:00:00+01:00`);
  const [best] = await db.select({ score: quizAttempts.score, total: quizAttempts.total }).from(quizAttempts)
    .where(and(eq(quizAttempts.userId, user.id), eq(quizAttempts.documentId, doc.id), gte(quizAttempts.at, today))).orderBy(desc(quizAttempts.score)).limit(1);
  const perfectToday = Boolean(best && best.total > 0 && best.score === best.total);
  const duration = durationMs === undefined ? null : Math.max(0, Math.min(7_200_000, Math.round(Number(durationMs) || 0)));
  await db.insert(quizAttempts).values({ userId: user.id, documentId: doc.id, score, total, mode: "classic", durationMs: duration });
  await trackEvent("quiz_done", user);
  const gained = await recordStudy(user.id, { questions: total, correct: score, xp: quizXp(score, perfectToday) });
  const subject = doc.subjectId;
  const result = await afterStudy(user.id, gained, (quest) => quest === "cards" || (subject !== null && quest === `weak:${subject}`), total);
  return { score, total, corrections: quiz.questions.map((q) => ({ answer: q.answer, explanation: q.explanation })), xp: result.xp, game: result.game };
}

export async function regenerateQuiz(form: FormData) {
  const admin = await requireAdmin();
  const id = uuid.parse(form.get("id"));
  await db.delete(quizzes).where(eq(quizzes.documentId, id));
  await db.update(documents).set({ quizStatus: "pending" }).where(eq(documents.id, id));
  await audit(admin.email, "quiz_régénéré", id);
  revalidatePath(`/d/${id}`);
}

export async function createExam(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireModerator();
  const subjectId = Number(str(form, "subject", 9));
  const [subject] = subjectId ? await db.select().from(subjects).where(eq(subjects.id, subjectId)) : [];
  if (!subject || (user.role !== "admin" && subject.programId !== user.programId)) return { error: "Choisis une matière de ta licence." };
  // Le champ datetime-local n'a pas de fuseau, et le serveur tourne en UTC : ce qui est saisi est une heure de Paris
  const at = parisLocalToDate(str(form, "at", 40));
  if (!at) return { error: "Indique une date valide." };
  // Partiel ou contrôle continu ; toute autre valeur redevient un partiel
  const kind = examKindOf(form.get("kind"));
  const title = str(form, "title", 160) || examShort(kind);
  await db.insert(exams).values({ subjectId, title, at, kind, place: str(form, "place", 120), createdBy: user.id });
  await audit(user.email, kind === "cc" ? "cc_ajouté" : "partiel_ajouté", `${subject.name} : ${title}`);
  revalidatePath("/reviser/partiels");
  return { ok: "Date ajoutée au calendrier." };
}

export async function deleteExam(form: FormData) {
  const user = await requireModerator();
  const [row] = await db.select({ exam: exams, subject: subjects }).from(exams).innerJoin(subjects, eq(exams.subjectId, subjects.id)).where(eq(exams.id, uuid.parse(form.get("id"))));
  if (!row || (user.role !== "admin" && row.subject.programId !== user.programId)) return;
  await db.delete(exams).where(eq(exams.id, row.exam.id));
  revalidatePath("/reviser/partiels");
}

/** Coupe ou relance la série de rappels d'un partiel, pour soi seulement. */
export async function toggleExamSeries(form: FormData) {
  const user = await requireUser();
  const examId = uuid.parse(form.get("id"));
  const [exists] = await db.select({ id: exams.id }).from(exams).where(eq(exams.id, examId));
  if (!exists) return;
  const { examSeriesMutes } = schema;
  if (form.get("mute") === "1") await db.insert(examSeriesMutes).values({ userId: user.id, examId }).onConflictDoNothing();
  else await db.delete(examSeriesMutes).where(and(eq(examSeriesMutes.userId, user.id), eq(examSeriesMutes.examId, examId)));
  revalidatePath("/reviser/partiels");
}
