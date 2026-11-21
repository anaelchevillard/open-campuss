import { and, asc, eq, notInArray } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { json, notFoundResponse } from "@/lib/http";
import { pushEndpointInput, pushSubscriptionInput } from "@/lib/push-endpoint";
import { rateHit, rateLimited } from "@/lib/security";

const { pushSubscriptions } = schema;
const MAX_DEVICES = 10;

export async function POST(request: Request) {
  if (!env.pushEnabled) return notFoundResponse();
  const user = await currentUser();
  if (!user) return json({ error: "Accès refusé" }, 403);
  const key = `push-subscribe:${user.id}`;
  if (await rateLimited(key, 30, 60)) return json({ error: "Trop de demandes." }, 429);
  await rateHit(key);
  const parsed = pushSubscriptionInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Abonnement refusé." }, 400);
  const { endpoint, keys } = parsed.data;
  // Un appareil partagé passe au dernier compte qui s'y est abonné
  await db.insert(pushSubscriptions).values({ endpoint, userId: user.id, ...keys }).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: user.id, ...keys } });
  const kept = await db.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id)).orderBy(asc(pushSubscriptions.createdAt));
  const recent = kept.slice(-MAX_DEVICES).map((row) => row.endpoint);
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, user.id), notInArray(pushSubscriptions.endpoint, recent)));
  return json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return json({ error: "Accès refusé" }, 403);
  const parsed = pushEndpointInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Requête refusée." }, 400);
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, parsed.data.endpoint), eq(pushSubscriptions.userId, user.id)));
  return json({ ok: true });
}
