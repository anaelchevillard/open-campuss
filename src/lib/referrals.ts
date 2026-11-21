import "server-only";
import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, schema } from "./db";
import { CREDITS_PER_REFERRAL, syncBadges } from "./gamification";
import { isInviteCode } from "./invite-code";
import { notify } from "./notify";

const { referrals, userHabits, users } = schema;

/** Distinct du code ami : ce lien circule au dehors, et le connaître ne donne aucun moyen de joindre son auteur. */
export async function inviteCodeOf(userId: string) {
  const [row] = await db.select({ code: userHabits.inviteCode }).from(userHabits).where(eq(userHabits.userId, userId));
  if (row?.code) return row.code;
  const code = randomBytes(12).toString("base64url");
  await db.insert(userHabits).values({ userId, inviteCode: code }).onConflictDoUpdate({ target: userHabits.userId, set: { inviteCode: code }, where: isNull(userHabits.inviteCode) });
  const [saved] = await db.select({ code: userHabits.inviteCode }).from(userHabits).where(eq(userHabits.userId, userId));
  return saved.code!;
}

/** Appelé seulement pour un compte qui vient d'être créé. Un code inconnu ne change rien à l'inscription, ni à sa réponse. */
export async function recordReferral(code: unknown, refereeId: string) {
  if (!isInviteCode(code)) return;
  const [referrer] = await db.select({ id: users.id }).from(userHabits).innerJoin(users, eq(userHabits.userId, users.id)).where(and(eq(userHabits.inviteCode, code), eq(users.status, "active")));
  if (!referrer || referrer.id === refereeId) return;
  await db.insert(referrals).values({ referrerId: referrer.id, refereeId }).onConflictDoNothing();
}

/** À l'activation, une seule fois même si le compte est plus tard désactivé puis rouvert. */
export async function creditReferral(refereeId: string) {
  const [won] = await db.update(referrals).set({ creditedAt: new Date() }).where(and(eq(referrals.refereeId, refereeId), isNull(referrals.creditedAt))).returning({ referrerId: referrals.referrerId });
  if (!won) return;
  await syncBadges(won.referrerId);
  await notify(won.referrerId, { kind: "impact", title: "Quelqu’un que tu as invité a rejoint Campuss", body: `${CREDITS_PER_REFERRAL} crédits pour toi.`, href: "/amis" });
}

export async function referralCount(userId: string) {
  const [row] = await db.select({ n: count() }).from(referrals).where(and(eq(referrals.referrerId, userId), isNotNull(referrals.creditedAt)));
  return row.n;
}
