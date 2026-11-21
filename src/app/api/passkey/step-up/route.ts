import { generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiMember, audit, markStepUp } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { json } from "@/lib/http";
import { rp, saveChallenge, takeChallenge } from "@/lib/passkeys";
import { rateHit, rateLimited } from "@/lib/security";

/** Confirme une action sensible (administration, ajout d'un facteur, codes de secours) : seules les clés de ce compte sont proposées et acceptées. */
export async function GET() {
  const user = await apiMember();
  if (!user) return json({ error: "Accès refusé" }, 403);
  const key = `passkey-step-up:${user.id}`;
  if (await rateLimited(key, 20, 15)) return json({ error: "Trop d’essais. Réessaie plus tard." }, 429);
  await rateHit(key);
  const keys = await db.select().from(schema.passkeys).where(eq(schema.passkeys.userId, user.id));
  if (!keys.length) return json({ error: "Aucune clé d’accès sur ce compte." }, 400);
  const options = await generateAuthenticationOptions({ rpID: rp().rpID, userVerification: "preferred", allowCredentials: keys.map((k) => ({ id: k.credentialId, transports: k.transports as never })) });
  return json({ options, challengeId: await saveChallenge(options.challenge, user.id) });
}

export async function POST(request: Request) {
  const user = await apiMember();
  if (!user) return json({ error: "Accès refusé" }, 403);
  const body = z.object({ challengeId: z.uuid(), response: z.object({ id: z.string().max(512) }).loose() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "Requête invalide" }, 400);
  const challenge = await takeChallenge(body.data.challengeId);
  if (!challenge || challenge.userId !== user.id) return json({ error: "Demande expirée. Recommence." }, 400);
  const [row] = await db.select().from(schema.passkeys).where(and(eq(schema.passkeys.credentialId, body.data.response.id), eq(schema.passkeys.userId, user.id)));
  if (!row) return json({ error: "Clé non reconnue." }, 400);
  const { rpID, origin } = rp();
  const verified = await verifyAuthenticationResponse({
    response: body.data.response as never, expectedChallenge: challenge.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false,
    credential: { id: row.credentialId, publicKey: new Uint8Array(Buffer.from(row.publicKey, "base64")), counter: row.counter, transports: row.transports as never },
  }).catch(() => null);
  if (!verified?.verified) return json({ error: "Clé non reconnue." }, 400);
  await db.update(schema.passkeys).set({ counter: verified.authenticationInfo.newCounter, lastUsedAt: new Date() }).where(eq(schema.passkeys.credentialId, row.credentialId));
  await markStepUp();
  await audit(user.email, "double_authentification_redonnée", "clé d’accès");
  return json({ ok: true });
}
