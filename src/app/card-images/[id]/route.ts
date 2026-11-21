import { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { readableCardImage } from "@/lib/card-images";
import { cardImageKey, getObject } from "@/lib/s3";

const missing = () => new Response("Introuvable", { status: 404 });

/** Image d'une fiche : même réponse qu'une image inexistante pour qui ne peut pas la voir. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  const id = z.uuid().safeParse((await params).id);
  if (!user || user.mustChangePassword || !id.success) return missing();
  const image = await readableCardImage(user, id.data.toLowerCase());
  if (!image) return missing();
  const object = await getObject(cardImageKey(image.id));
  if (!object?.Body) return missing();
  return new Response(await object.Body.transformToByteArray() as BodyInit, { headers: {
    "Content-Type": image.inlineType, "Content-Length": String(image.size), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'self'",
  } });
}
