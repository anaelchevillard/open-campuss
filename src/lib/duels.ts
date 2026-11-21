import "server-only";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { canRead } from "./access-server";
import { db, schema } from "./db";
import type { Document, User } from "./db/schema";

const { documents, quizDuelScores, quizDuels, users } = schema;

export const DUEL_DAYS = 30;

export type Duel = typeof quizDuels.$inferSelect;

/** Tout accès à un défi passe ici. Défi d'ami : les deux personnes. Lien : quiconque peut lire le cours, donc sa licence. */
export async function duelFor(rawId: string, user: Pick<User, "id" | "role" | "programId">) {
  if (!z.uuid().safeParse(rawId).success) return null;
  const [row] = await db.select({ duel: quizDuels, doc: documents, challengerName: users.name }).from(quizDuels).innerJoin(documents, eq(quizDuels.documentId, documents.id)).innerJoin(users, eq(quizDuels.challengerId, users.id)).where(eq(quizDuels.id, rawId));
  if (!row) return null;
  const mine = row.duel.challengerId === user.id;
  if (mine) return { ...row, mine };
  if (row.duel.invitedId && row.duel.invitedId !== user.id) return null;
  if (!canPlay(row.doc) || !(await canRead(user, row.doc))) return null;
  return { ...row, mine };
}

/** Un brouillon ou un cours masqué ne se joue pas à plusieurs : les réponses resteraient accessibles après le retrait. */
export const canPlay = (doc: Pick<Document, "published" | "hiddenByReports" | "quizStatus">) => doc.published && !doc.hiddenByReports && doc.quizStatus === "ready";

export async function scoresOf(duelId: string) {
  return db.select({ userId: quizDuelScores.userId, score: quizDuelScores.score, total: quizDuelScores.total, name: users.name }).from(quizDuelScores).innerJoin(users, eq(quizDuelScores.userId, users.id)).where(eq(quizDuelScores.duelId, duelId)).orderBy(desc(quizDuelScores.at));
}

/** Comparaison au pourcentage : le quiz a pu être régénéré entre les deux parties. */
export function compareDuel(mine: { score: number; total: number }, other: { score: number; total: number }) {
  const a = mine.total ? mine.score / mine.total : 0;
  const b = other.total ? other.score / other.total : 0;
  return a > b ? "ahead" as const : a < b ? "behind" as const : "tied" as const;
}
