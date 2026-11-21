import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { canEdit, canRead } from "@/lib/access-server";
import { apiMember } from "@/lib/auth";
import { antivirusEnabled } from "@/lib/clamav";
import { cleanFilename, sniffInline } from "@/lib/content-utils";
import { cleanImage, ImageRejected, nameForType } from "@/lib/image-clean";
import { db, schema } from "@/lib/db";
import { demoUploadRefusal } from "@/lib/demo";
import { json } from "@/lib/http";
import { fileKey, putObject } from "@/lib/s3";
import { rateHit, rateLimited } from "@/lib/security";
import { quotaRefusal } from "@/lib/storage-usage";

const decodeName = (raw: string | null) => { try { return decodeURIComponent(raw ?? ""); } catch { return ""; } };
const MAX_IMAGE = 8 * 1024 * 1024;
// Le proxy de l'application coupe au-delà de 17 Mo : pour une longue vidéo, YouTube reste la bonne voie
const MAX_MEDIA = 16 * 1024 * 1024;

/** Fichier inséré dans un cours : le type vient de la signature du fichier, jamais de ce que le client annonce. */
export async function POST(request: NextRequest) {
  const user = await apiMember();
  const id = z.uuid().safeParse(request.nextUrl.searchParams.get("doc"));
  if (!user || user.mustChangePassword || !id.success) return json({ error: "Accès refusé" }, 403);
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, id.data));
  if (!doc) return json({ error: "Accès refusé" }, 403);
  const cover = request.nextUrl.searchParams.get("cover") === "1";
  const editing = (await canEdit(user, doc)) || (doc.published && doc.createdBy === user.id);
  // Une proposition de modification d'un cours publié peut ajouter des éléments : jamais la couverture, avec un débit plus serré
  const proposing = !editing && !cover && doc.published && doc.kind === "editor" && !doc.deletedAt && !doc.hiddenByReports && (await canRead(user, doc));
  if (!editing && !proposing) return json({ error: "Accès refusé" }, 403);
  const key = `editor-image:${user.id}`;
  if (await rateLimited(key, proposing ? 20 : 100, 60)) return json({ error: "Trop de fichiers envoyés. Réessaie plus tard." }, 429);
  const heavy = demoUploadRefusal(request.headers.get("content-length"));
  if (heavy) return heavy;
  if (Number(request.headers.get("content-length")) > MAX_MEDIA) return json({ error: "Fichier trop lourd (16 Mo maximum). Pour une vidéo, passe par YouTube." }, 413);
  // Les fichiers d'une proposition comptent dans l'espace de la personne qui propose, pas dans celui de l'auteur
  const refused = await quotaRefusal(user, proposing ? user.id : doc.createdBy, Number(request.headers.get("content-length")) || 0);
  if (refused) return refused;
  const received = Buffer.from(await request.arrayBuffer());
  let buffer: Buffer = received;
  let inlineType = sniffInline(received.subarray(0, 16));
  const isImage = inlineType?.startsWith("image/");
  if (!inlineType || (cover && !isImage)) return json({ error: cover ? "Seules les images PNG, JPEG et WebP sont acceptées." : "Formats acceptés : images, vidéos MP4 ou WebM, audio, PDF." }, 415);
  const heavyBody = demoUploadRefusal(received.length);
  if (heavyBody) return heavyBody;
  if (received.length > (isImage ? MAX_IMAGE : MAX_MEDIA)) return json({ error: isImage ? "Image trop lourde (8 Mo maximum)." : "Fichier trop lourd (16 Mo maximum)." }, 413);
  await rateHit(key);
  let filename = cleanFilename(decodeName(request.headers.get("x-filename")) || (isImage ? "image" : "fichier"));
  if (isImage) {
    try {
      const cleaned = await cleanImage(received);
      buffer = cleaned.buffer;
      inlineType = cleaned.inlineType;
      filename = nameForType(filename, inlineType);
    } catch (error) {
      if (error instanceof ImageRejected) return json({ error: error.message }, 415);
      throw error;
    }
  }
  const [file] = await db.insert(schema.docFiles).values({ documentId: doc.id, filename, size: buffer.length, inlineType, embedded: true, ...(!isImage && antivirusEnabled() ? { scanStatus: "pending" } : {}) }).returning();
  await putObject(fileKey(file.id), buffer, "application/octet-stream");
  if (cover) await db.update(schema.documents).set({ coverFileId: file.id }).where(eq(schema.documents.id, doc.id));
  return json({ url: `/files/${file.id}?inline=1` });
}
