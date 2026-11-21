import { generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { afterFullLogin, audit, clientIp, createSession, destroyCurrentSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { json } from "@/lib/http";
import { rp, saveChallenge, takeChallenge } from "@/lib/passkeys";
import { rateHit, rateLimited } from "@/lib/security";

export async function GET() {
  const { rpID } = rp();
  const key = `passkey-ip:${await clientIp()}`;
  if (await rateLimited(key, 40, 15)) return json({ error: "Trop d’essais. Réessaie plus tard." }, 429);
  await rateHit(key);
  const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred" });
  return json({ options, challengeId: await saveChallenge(options.challenge) });
}

/** La clé remplace mot de passe et code : elle prouve à elle seule la possession de l'appareil. */
export async function POST(request: Request) {
  const body = z.object({ challengeId: z.uuid(), response: z.object({ id: z.string().max(512) }).loose() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "Requête invalide" }, 400);
  const challenge = await takeChallenge(body.data.challengeId);
  if (!challenge) return json({ error: "Demande expirée. Recommence." }, 400);
  const [row] = await db.select({ key: schema.passkeys, user: schema.users }).from(schema.passkeys).innerJoin(schema.users, eq(schema.passkeys.userId, schema.users.id)).where(eq(schema.passkeys.credentialId, body.data.response.id));
  if (!row || row.user.status !== "active") return json({ error: "Clé non reconnue." }, 400);
  const { rpID, origin } = rp();
  const verified = await verifyAuthenticationResponse({
    response: body.data.response as never, expectedChallenge: challenge.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false,
    credential: { id: row.key.credentialId, publicKey: new Uint8Array(Buffer.from(row.key.publicKey, "base64")), counter: row.key.counter, transports: row.key.transports as never },
  }).catch(() => null);
  if (!verified?.verified) return json({ error: "Clé non reconnue." }, 400);
  await db.update(schema.passkeys).set({ counter: verified.authenticationInfo.newCounter, lastUsedAt: new Date() }).where(eq(schema.passkeys.credentialId, row.key.credentialId));
  await destroyCurrentSession();
  await createSession(row.user.id, false, true);
  await afterFullLogin(row.user);
  await audit(row.user.email, "connexion_cle_acces");
  return json({ ok: true });
}
