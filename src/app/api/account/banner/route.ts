import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { profileStanding } from "@/lib/gamification";
import { demoApiRefusal } from "@/lib/demo";
import { json } from "@/lib/http";
import { cleanImage, ImageRejected } from "@/lib/image-clean";
import { forgetProfileCaches } from "@/lib/profile-data";
import { deleteKey, putObject } from "@/lib/s3";
import { rateHit, rateLimited } from "@/lib/security";

const MAX_BANNER = 3 * 1024 * 1024;
const { userProfiles } = schema;

async function previousKey(userId: string) {
  const [row] = await db.select({ banner: userProfiles.banner, locked: userProfiles.appearanceLockedUntil }).from(userProfiles).where(eq(userProfiles.userId, userId));
  return { key: row?.banner?.kind === "image" ? row.banner.key : undefined, locked: Boolean(row?.locked && row.locked > new Date()) };
}

/** Image de bannière : réencodée côté serveur (plus de métadonnées), réservée à qui l'a débloquée, coupée si l'admin la désactive. */
export async function POST(request: Request) {
  const demo = demoApiRefusal();
  if (demo) return demo;
  const user = await currentUser();
  if (!user) return json({ error: "Accès refusé" }, 403);
  const { unlocked } = await profileStanding(user);
  if (!unlocked["banniere-image"].open) return json({ error: "Image de bannière pas encore débloquée." }, 403);
  const previous = await previousKey(user.id);
  if (previous.locked) return json({ error: "Apparence réinitialisée par la modération." }, 403);
  const key = `banner:${user.id}`;
  if (await rateLimited(key, 10, 60)) return json({ error: "Trop de changements. Réessaie plus tard." }, 429);
  if (Number(request.headers.get("content-length")) > MAX_BANNER) return json({ error: "Image trop lourde." }, 413);
  const received = Buffer.from(await request.arrayBuffer());
  if (received.length > MAX_BANNER) return json({ error: "Image trop lourde." }, 413);
  await rateHit(key);
  let buffer: Buffer;
  try {
    buffer = (await cleanImage(received, { format: "jpeg", maxSide: 1600 })).buffer;
  } catch (error) {
    if (error instanceof ImageRejected) return json({ error: "Format refusé." }, 415);
    throw error;
  }
  const bannerKey = `banners/${randomUUID()}`;
  await putObject(bannerKey, buffer, "image/jpeg");
  const banner = { kind: "image" as const, value: "image", key: bannerKey };
  await db.insert(userProfiles).values({ userId: user.id, banner }).onConflictDoUpdate({ target: userProfiles.userId, set: { banner, updatedAt: new Date() } });
  if (previous.key) await deleteKey(previous.key).catch(() => undefined);
  forgetProfileCaches(user.id);
  revalidatePath(`/u/${user.id}`);
  return json({ ok: true, key: bannerKey });
}

export async function DELETE() {
  const demo = demoApiRefusal();
  if (demo) return demo;
  const user = await currentUser();
  if (!user) return json({ error: "Accès refusé" }, 403);
  const previous = await previousKey(user.id);
  if (previous.key) {
    await db.update(userProfiles).set({ banner: null, updatedAt: new Date() }).where(eq(userProfiles.userId, user.id));
    await deleteKey(previous.key).catch(() => undefined);
  }
  revalidatePath(`/u/${user.id}`);
  return json({ ok: true });
}
