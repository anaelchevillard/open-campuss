"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { aiAvailable } from "@/lib/ai-available";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { recordStudy } from "@/lib/habits";
import { coursesWithoutQuiz } from "@/lib/mock-exam-server";
import { rateHit, rateLimited } from "@/lib/security";

const { documents, flashcards, subjects } = schema;

const QUIZ_REQUESTS_PER_DAY = 3;
const QUIZ_BATCH = 6;

/**
 * « Générer les quiz avec Campuss IA » : les cours publiés d'une matière de sa licence, sans quiz,
 * passent dans la file de génération (un quiz par cours, généré une fois puis partagé). 6 cours, 3 demandes par jour.
 */
export async function requestSubjectQuizzes(rawSubject: number): Promise<{ ok: string; queued: number } | { error: string }> {
  const user = await requireUser();
  const subjectId = z.number().int().positive().parse(rawSubject);
  const [subject] = await db.select({ programId: subjects.programId }).from(subjects).where(eq(subjects.id, subjectId));
  if (!subject || (user.role !== "admin" && subject.programId !== user.programId)) return { error: "Choisis une matière de ta licence." };
  if (!(await aiAvailable())) return { error: "Campuss IA n’est pas disponible pour l’instant." };
  const key = `quiz-request:${user.id}`;
  if (await rateLimited(key, QUIZ_REQUESTS_PER_DAY, 1440)) return { error: "Tu as déjà demandé des quiz aujourd’hui : ils arrivent." };
  const waiting = (await coursesWithoutQuiz(user, subjectId, 30)).filter((c) => c.quizStatus !== "pending").slice(0, QUIZ_BATCH);
  if (!waiting.length) return { ok: "Les quiz de cette matière sont déjà en préparation.", queued: 0 };
  await rateHit(key);
  // Seuls des cours publiés et lisibles, relus avant publication : le travail de génération reste celui de la publication
  await db.update(documents).set({ quizStatus: "pending" }).where(and(inArray(documents.id, waiting.map((c) => c.id)), eq(documents.published, true), inArray(documents.quizStatus, ["none", "failed"])));
  revalidatePath("/reviser/seance");
  return { ok: `Campuss IA prépare ${waiting.length} quiz. Reviens dans quelques minutes.`, queued: waiting.length };
}

const cardAnswers = z.array(z.object({ card: z.uuid(), choices: z.array(z.uuid()).min(2).max(5), choice: z.number().int().min(-1).max(4) })).min(1).max(20);

/**
 * Partiel avec ses propres fiches : corrigé sur le serveur, par identifiants, seulement sur les fiches de la personne.
 * Pas d'XP : les questions viennent de ses fiches, elle pourrait les connaître d'avance.
 */
export async function submitCardsMock(raw: unknown, durationMs: number) {
  const user = await requireUser();
  const given = cardAnswers.parse(raw);
  const key = `cards-mock:${user.id}`;
  if (await rateLimited(key, 40, 1440)) throw new Error("trop de partiels");
  await rateHit(key);
  const ids = [...new Set(given.flatMap((g) => [g.card, ...g.choices]))];
  const owned = new Set((await db.select({ id: flashcards.id }).from(flashcards).where(and(eq(flashcards.userId, user.id), inArray(flashcards.id, ids)))).map((c) => c.id));
  if (ids.some((id) => !owned.has(id)) || given.some((g) => !g.choices.includes(g.card))) throw new Error("fiche inconnue");
  const corrections = given.map((g) => ({ answer: g.choices.indexOf(g.card), explanation: "", correct: g.choices[g.choice] === g.card }));
  const score = corrections.filter((c) => c.correct).length;
  const seconds = Math.round(Math.max(0, Math.min(7_200_000, Math.round(Number(durationMs) || 0))) / 1000);
  await recordStudy(user.id, { questions: corrections.length, correct: score, xp: 0, seconds });
  return { score, total: corrections.length, corrections, xp: 0 };
}
