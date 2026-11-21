import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { currentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { syncBadges } from "@/lib/gamification";
import { demoApiRefusal } from "@/lib/demo";
import { json } from "@/lib/http";
import { cleanImage, ImageRejected } from "@/lib/image-clean";
import { deleteKey, putObject } from "@/lib/s3";
import { rateHit, rateLimited } from "@/lib/security";

const MAX_AVATAR = 1024 * 1024;

/** Le navigateur réduit déjà la photo, mais c'est le réencodage côté serveur qui garantit l'absence de métadonnées (GPS). */
export async function POST(request: Request) {
  const demo = demoApiRefusal();
  if (demo) return demo;
  const user = await currentUser();
  if (!user) return json({ error: "Accès refusé" }, 403);
  const key = `avatar:${user.id}`;
  if (await rateLimited(key, 20, 60)) return json({ error: "Trop de changements de photo. Réessaie plus tard." }, 429);
  if (Number(request.headers.get("content-length")) > MAX_AVATAR) return json({ error: "Photo trop lourde." }, 413);
  const received = Buffer.from(await request.arrayBuffer());
  if (received.length > MAX_AVATAR) return json({ error: "Photo trop lourde." }, 413);
  await rateHit(key);
  let buffer: Buffer;
  try {
    buffer = (await cleanImage(received, { format: "jpeg", maxSide: 1024 })).buffer;
  } catch (error) {
    if (error instanceof ImageRejected) return json({ error: "Format refusé." }, 415);
    throw error;
  }
  const avatarKey = `avatars/${randomUUID()}`;
  await putObject(avatarKey, buffer, "image/jpeg");
  await db.update(schema.users).set({ avatarKey }).where(eq(schema.users.id, user.id));
  if (user.avatarKey) await deleteKey(user.avatarKey).catch(() => undefined);
  await syncBadges(user.id);
  return json({ ok: true });
}

export async function DELETE() {
  const demo = demoApiRefusal();
  if (demo) return demo;
  const user = await currentUser();
  if (!user) return json({ error: "Accès refusé" }, 403);
  if (user.avatarKey) await deleteKey(user.avatarKey).catch(() => undefined);
  await db.update(schema.users).set({ avatarKey: null }).where(eq(schema.users.id, user.id));
  return json({ ok: true });
}
