import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiMember } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { demoUploadRefusal } from "@/lib/demo";
import { json } from "@/lib/http";
import { cleanImage, ImageRejected } from "@/lib/image-clean";
import { revisionAccess } from "@/lib/revision";
import { putObject, revisionKey } from "@/lib/s3";
import { rateHit, rateLimited } from "@/lib/security";
import { quotaRefusal } from "@/lib/storage-usage";

const MAX_IMAGE = 8 * 1024 * 1024;

/** Photo ajoutée en révision : rangée à part du cours, elle n'est visible que par les membres de l'espace. */
export async function POST(request: NextRequest) {
  const user = await apiMember();
  const id = z.uuid().safeParse(request.nextUrl.searchParams.get("space"));
  if (!user || user.mustChangePassword || !id.success || !(await revisionAccess(id.data, user.id))) return json({ error: "Accès refusé" }, 403);
  const key = `revision-image:${user.id}`;
  if (await rateLimited(key, 100, 60)) return json({ error: "Trop de photos envoyées. Réessaie plus tard." }, 429);
  const heavy = demoUploadRefusal(request.headers.get("content-length"));
  if (heavy) return heavy;
  if (Number(request.headers.get("content-length")) > MAX_IMAGE) return json({ error: "Photo trop lourde (8 Mo maximum)." }, 413);
  const [space] = await db.select({ ownerId: schema.revisionSpaces.ownerId }).from(schema.revisionSpaces).where(eq(schema.revisionSpaces.id, id.data));
  const refused = await quotaRefusal(user, space?.ownerId ?? null, Number(request.headers.get("content-length")) || 0);
  if (refused) return refused;
  const received = Buffer.from(await request.arrayBuffer());
  const heavyBody = demoUploadRefusal(received.length);
  if (heavyBody) return heavyBody;
  if (received.length > MAX_IMAGE) return json({ error: "Photo trop lourde (8 Mo maximum)." }, 413);
  await rateHit(key);
  let cleaned;
  try {
    cleaned = await cleanImage(received);
  } catch (error) {
    if (error instanceof ImageRejected) return json({ error: error.message }, 415);
    throw error;
  }
  const { buffer, inlineType } = cleaned;
  const [file] = await db.insert(schema.revisionFiles).values({ spaceId: id.data, inlineType, size: buffer.length }).returning();
  await putObject(revisionKey(file.id), buffer, "application/octet-stream");
  return json({ id: file.id, url: `/revision-files/${file.id}?inline=1` });
}
