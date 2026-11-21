import "server-only";
import { count, eq } from "drizzle-orm";
import { aiAllowance, aiRefusal, quotaKey, type AiUse } from "./ai-quota";
import { db, schema } from "./db";
import type { User } from "./db/schema";
import { creditsOf, POINTS } from "./gamification";

const { rateEvents } = schema;
type Who = Pick<User, "id" | "role">;

const countOf = async (key: string) => (await db.select({ n: count() }).from(rateEvents).where(eq(rateEvents.key, key)))[0].n;

export type AiReservation = { ok: true; left: number; release: () => Promise<void> } | { ok: false; limit: number; credits: number };

/** Réserve avant l'appel : deux envois simultanés ne dépassent pas la limite. Un appel raté se rend avec release(). */
export async function reserveAi(user: Who, use: AiUse): Promise<AiReservation> {
  const credits = await creditsOf(user.id);
  const limit = aiAllowance(credits, user.role === "admin")[use];
  const key = quotaKey(use, user.id, new Date());
  const [row] = await db.insert(rateEvents).values({ key }).returning({ id: rateEvents.id });
  const release = async () => { await db.delete(rateEvents).where(eq(rateEvents.id, row.id)); };
  const used = await countOf(key);
  if (used > limit) {
    await release();
    return { ok: false, limit, credits };
  }
  return { ok: true, left: limit - used, release };
}

export const aiRefusalFor = (use: "pages" | "memo", refused: { limit: number; credits: number }) => aiRefusal(use, refused.limit, refused.credits, POINTS.cours);

/** Ce qu'il reste aujourd'hui, pour l'afficher sans rien consommer. */
export async function aiUsage(user: Who) {
  const credits = await creditsOf(user.id);
  const allowance = aiAllowance(credits, user.role === "admin");
  const now = new Date();
  const [pages, memo] = await Promise.all([countOf(quotaKey("pages", user.id, now)), countOf(quotaKey("memo", user.id, now))]);
  return { credits, allowance, left: { pages: Math.max(0, allowance.pages - pages), memo: Math.max(0, allowance.memo - memo) } };
}
