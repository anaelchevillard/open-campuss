"use server";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { canRead } from "@/lib/access-server";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { canPlay, compareDuel, DUEL_DAYS, duelFor } from "@/lib/duels";
import { env } from "@/lib/env";
import { areFriends, friendsOf } from "@/lib/friends";
import { notify } from "@/lib/notify";
import { rateHit, rateLimited } from "@/lib/security";

const { documents, quizAttempts, quizDuelScores, quizDuels, quizzes } = schema;

/** Le score du lanceur est relu en base : le navigateur n'en dit rien. */
async function prepare(user: User, rawDoc: string): Promise<{ error: string } | { doc: typeof documents.$inferSelect; score: number; total: number }> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, z.uuid().parse(rawDoc)));
  if (!doc || !canPlay(doc) || !(await canRead(user, doc))) return { error: "Ce quiz ne peut pas servir de défi." };
  const [attempt] = await db.select({ score: quizAttempts.score, total: quizAttempts.total }).from(quizAttempts).where(and(eq(quizAttempts.userId, user.id), eq(quizAttempts.documentId, doc.id))).orderBy(desc(quizAttempts.at)).limit(1);
  if (!attempt) return { error: "Joue d’abord le quiz : ton score sera celui à battre." };
  const key = `duel:${user.id}`;
  if (await rateLimited(key, 30, 1440)) return { error: "Trop de défis aujourd’hui. Réessaie demain." };
  await rateHit(key);
  return { doc, ...attempt };
}

const expires = () => new Date(Date.now() + DUEL_DAYS * 86_400_000);

export async function challengeFriend(rawDoc: string, rawFriend: string): Promise<{ ok: string } | { error: string }> {
  const user = await requireUser();
  const friendId = z.uuid().parse(rawFriend);
  const friend = (await friendsOf(user.id)).find((person) => person.id === friendId);
  const ready = await prepare(user, rawDoc);
  if ("error" in ready) return ready;
  if (!friend || !(await areFriends(user.id, friendId)) || !(await canRead(friend, ready.doc))) return { error: "Cette personne ne peut pas recevoir ce défi." };
  const [duel] = await db.insert(quizDuels).values({ documentId: ready.doc.id, challengerId: user.id, invitedId: friendId, challengerScore: ready.score, challengerTotal: ready.total, expiresAt: expires() }).returning();
  await notify(friendId, { kind: "duel", title: `${user.name} te défie sur un quiz`, body: ready.doc.title, href: `/defi/${duel.id}` });
  return { ok: `Défi envoyé à ${friend.name}.` };
}

export async function createDuelLink(rawDoc: string): Promise<{ url: string } | { error: string }> {
  const user = await requireUser();
  const ready = await prepare(user, rawDoc);
  if ("error" in ready) return ready;
  const [duel] = await db.insert(quizDuels).values({ documentId: ready.doc.id, challengerId: user.id, challengerScore: ready.score, challengerTotal: ready.total, expiresAt: expires() }).returning();
  return { url: `${env.baseUrl}/defi/${duel.id}` };
}

/** Comme submitQuiz : la correction part seulement une fois le score enregistré, et une seule partie compte. */
export async function playDuel(rawId: string, answers: number[]) {
  const user = await requireUser();
  const access = await duelFor(rawId, user);
  if (!access || access.mine || access.duel.expiresAt < new Date()) throw new Error("défi introuvable");
  const { duel, doc } = access;
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.documentId, doc.id));
  if (!quiz) throw new Error("quiz introuvable");
  const given = z.array(z.number().int()).max(20).parse(answers);
  const score = quiz.questions.filter((q, i) => given[i] === q.answer).length;
  const total = quiz.questions.length;
  const [won] = await db.insert(quizDuelScores).values({ duelId: duel.id, userId: user.id, score, total }).onConflictDoNothing().returning();
  // Déjà joué : on ne renvoie que le score retenu, pas une nouvelle correction qui compterait pour rien
  if (!won) throw new Error("défi déjà joué");
  await db.insert(quizAttempts).values({ userId: user.id, documentId: doc.id, score, total });
  const friend = await areFriends(user.id, duel.challengerId);
  const who = friend || duel.invitedId === user.id ? user.name : "Un étudiant de ta licence";
  await notify(duel.challengerId, { kind: "duel", title: `${who} a relevé ton défi`, body: `${score} sur ${total}, contre ${duel.challengerScore} sur ${duel.challengerTotal} pour toi.`, href: `/defi/${duel.id}` });
  // Pas de revalidatePath ici : la page se rechargerait et la correction disparaîtrait
  return {
    score, total, corrections: quiz.questions.map((q) => ({ answer: q.answer, explanation: q.explanation })),
    duel: { name: access.challengerName, score: duel.challengerScore, total: duel.challengerTotal, outcome: compareDuel({ score, total }, { score: duel.challengerScore, total: duel.challengerTotal }) },
  };
}
