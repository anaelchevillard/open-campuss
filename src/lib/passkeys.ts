import "server-only";
import { eq, lt } from "drizzle-orm";
import { db, schema } from "./db";
import { env } from "./env";

export const rp = () => { const url = new URL(env.baseUrl); return { rpID: url.hostname, origin: url.origin, rpName: env.siteName }; };

export async function saveChallenge(challenge: string, userId?: string) {
  await db.delete(schema.webauthnChallenges).where(lt(schema.webauthnChallenges.expiresAt, new Date()));
  const [row] = await db.insert(schema.webauthnChallenges).values({ challenge, userId, expiresAt: new Date(Date.now() + 300_000) }).returning();
  return row.id;
}

/** À usage unique : un défi lu est un défi supprimé. */
export async function takeChallenge(id: string) {
  const [row] = await db.delete(schema.webauthnChallenges).where(eq(schema.webauthnChallenges.id, id)).returning();
  return row && row.expiresAt > new Date() ? row : null;
}
