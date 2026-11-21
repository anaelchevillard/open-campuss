import { NextRequest } from "next/server";
import { apiMember } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { demoUploadRefusal } from "@/lib/demo";
import { json } from "@/lib/http";
import { cleanImage, ImageRejected } from "@/lib/image-clean";
import { cardImageKey, putObject } from "@/lib/s3";
import { rateHit, rateLimited } from "@/lib/security";
import { quotaRefusal } from "@/lib/storage-usage";

const MAX_IMAGE = 8 * 1024 * 1024;

/**
 * Image d'une fiche : même chemin que les photos de révision (signature vérifiée et image réécrite
 * par cleanImage, métadonnées retirées), rangée à part et comptée dans l'espace de la personne.
 */
export async function POST(request: NextRequest) {
  const user = await apiMember();
  if (!user || user.mustChangePassword) return json({ error: "Accès refusé" }, 403);
  const key = `card-image:${user.id}`;
  if (await rateLimited(key, 60, 60)) return json({ error: "Trop d’images envoyées. Réessaie plus tard." }, 429);
  const heavy = demoUploadRefusal(request.headers.get("content-length"));
  if (heavy) return heavy;
  if (Number(request.headers.get("content-length")) > MAX_IMAGE) return json({ error: "Image trop lourde (8 Mo maximum)." }, 413);
  const refused = await quotaRefusal(user, user.id, Number(request.headers.get("content-length")) || 0);
  if (refused) return refused;
  const received = Buffer.from(await request.arrayBuffer());
  const heavyBody = demoUploadRefusal(received.length);
  if (heavyBody) return heavyBody;
  if (received.length > MAX_IMAGE) return json({ error: "Image trop lourde (8 Mo maximum)." }, 413);
  await rateHit(key);
  let cleaned;
  try {
    cleaned = await cleanImage(received, { maxSide: 1600 });
  } catch (error) {
    if (error instanceof ImageRejected) return json({ error: error.message }, 415);
    throw error;
  }
  const { buffer, inlineType } = cleaned;
  const [image] = await db.insert(schema.cardImages).values({ ownerId: user.id, inlineType, size: buffer.length }).returning();
  await putObject(cardImageKey(image.id), buffer, "application/octet-stream");
  return json({ id: image.id, url: `/card-images/${image.id}?inline=1` });
}
