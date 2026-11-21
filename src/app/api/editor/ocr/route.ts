import { eq } from "drizzle-orm";
import { z } from "zod";
import { canEdit, isDocAuthor } from "@/lib/access-server";
import { aiRefusalFor, reserveAi } from "@/lib/ai-quota-server";
import { recordAttestation, rememberAcceptance } from "@/lib/attest-server";
import { apiMember, audit } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { normalizeCourse } from "@/lib/course";
import { json } from "@/lib/http";
import { cleanImage, ImageRejected } from "@/lib/image-clean";
import { OcrError, transcribeImage } from "@/lib/ocr";
import { rateHit, rateLimited } from "@/lib/security";

const body = z.object({ attest: z.literal(true), document: z.uuid(), image: z.string().max(16_000_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/) });

/** Sur ses propres brouillons, dans la limite de son quota. L'image n'est pas conservée ; le texte reçu est normalisé comme une saisie. */
export async function POST(request: Request) {
  const user = await apiMember();
  if (!user) return json({ error: "Accès refusé" }, 403);
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Image refusée." }, 400);
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, parsed.data.document));
  const allowed = doc && await canEdit(user, doc) && (user.role === "admin" || (!doc.published && await isDocAuthor(user.id, doc)));
  if (!allowed) return json({ error: "Accès refusé" }, 403);
  const key = `ocr:${user.id}`;
  if (await rateLimited(key, 200, 60)) return json({ error: "Trop de pages transcrites pour l’instant. Réessaie dans une heure." }, 429);
  await rateHit(key);
  let image: string;
  try {
    // Le réencodage retire le GPS et les autres métadonnées avant que la photo quitte le serveur
    const { buffer } = await cleanImage(Buffer.from(parsed.data.image.slice(parsed.data.image.indexOf(",") + 1), "base64"), { format: "jpeg" });
    image = `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch (error) {
    if (error instanceof ImageRejected) return json({ error: error.message }, 415);
    throw error;
  }
  const reservation = await reserveAi(user, "pages");
  if (!reservation.ok) return json({ error: aiRefusalFor("pages", reservation), quota: true }, 429);
  try {
    await recordAttestation(user, "ocr", doc);
    await rememberAcceptance(user.id, "ocr");
    const markdown = normalizeCourse(await transcribeImage(image));
    await audit(user.email, "transcription_ia");
    return json({ markdown, left: reservation.left });
  } catch (error) {
    await reservation.release();
    if (error instanceof OcrError) return json({ error: error.message }, 502);
    throw error;
  }
}
