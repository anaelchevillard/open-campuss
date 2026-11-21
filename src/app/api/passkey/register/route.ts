import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { audit, currentUser, missingStepUpToEnroll } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { demoApiRefusal } from "@/lib/demo";
import { json } from "@/lib/http";
import { rp, saveChallenge, takeChallenge } from "@/lib/passkeys";

export async function GET() {
  const demo = demoApiRefusal();
  if (demo) return demo;
  const user = await currentUser();
  // Jamais pendant un « voir comme » : une clé ajoutée au compte vu ouvrirait ce compte à l'administrateur
  if (!user || user.viewing) return json({ error: "Accès refusé" }, 403);
  const missing = await missingStepUpToEnroll(user);
  if (missing) return json(missing, 403);
  const keys = await db.select().from(schema.passkeys).where(eq(schema.passkeys.userId, user.id));
  const { rpID, rpName } = rp();
  const options = await generateRegistrationOptions({
    rpID, rpName, userName: user.email, userDisplayName: user.name, userID: new TextEncoder().encode(user.id), attestationType: "none",
    excludeCredentials: keys.map((k) => ({ id: k.credentialId })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  return json({ options, challengeId: await saveChallenge(options.challenge, user.id) });
}

export async function POST(request: Request) {
  const demo = demoApiRefusal();
  if (demo) return demo;
  const user = await currentUser();
  // Jamais pendant un « voir comme » : une clé ajoutée au compte vu ouvrirait ce compte à l'administrateur
  if (!user || user.viewing) return json({ error: "Accès refusé" }, 403);
  const missing = await missingStepUpToEnroll(user);
  if (missing) return json(missing, 403);
  const body = z.object({ challengeId: z.uuid(), name: z.string().trim().max(60).optional(), response: z.any() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "Requête invalide" }, 400);
  const challenge = await takeChallenge(body.data.challengeId);
  if (!challenge || challenge.userId !== user.id) return json({ error: "Demande expirée. Recommence." }, 400);
  const { rpID, origin } = rp();
  const verified = await verifyRegistrationResponse({ response: body.data.response, expectedChallenge: challenge.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false }).catch(() => null);
  if (!verified?.verified || !verified.registrationInfo) return json({ error: "Clé refusée." }, 400);
  const { credential } = verified.registrationInfo;
  await db.insert(schema.passkeys).values({
    credentialId: credential.id, userId: user.id, publicKey: Buffer.from(credential.publicKey).toString("base64"), counter: credential.counter,
    transports: credential.transports ?? [], name: body.data.name || "Clé d’accès",
  });
  await audit(user.email, "cle_acces_ajoutée");
  return json({ ok: true });
}
