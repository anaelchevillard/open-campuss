import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { rebuildDocumentSearch } from "@/lib/file-jobs";
import { audit, apiMember } from "@/lib/auth";
import { antivirusEnabled } from "@/lib/clamav";
import { ingestText, ingestZipObject } from "@/lib/content";
import { ContentError, detectKind, isHtmlAttachment, sniffInline } from "@/lib/content-utils";
import { db, schema } from "@/lib/db";
import { MAX_FILE_BYTES, PART_BYTES } from "@/lib/env";
import { demoUploadRefusal } from "@/lib/demo";
import { json } from "@/lib/http";
import { cleanImage, ImageRejected, nameForType } from "@/lib/image-clean";
import {
  abortMultipart, completeMultipart, copyObject, deleteKey, fileKey, getHead, getObject, getText, putObject, uploadPart,
} from "@/lib/s3";
import { quotaRefusal } from "@/lib/storage-usage";

// Tenue en mémoire le temps du réencodage. Au-delà, on refuse plutôt que de garder une photo avec ses métadonnées.
const MAX_ATTACHED_IMAGE = 32 * 1024 * 1024;

type Params = { params: Promise<{ id: string }> };

async function loadUpload(id: string, adminId: string) {
  if (!z.uuid().safeParse(id).success) return null;
  // Lié à son auteur : un autre administrateur ne peut pas écrire dans cet envoi
  const [row] = await db.select().from(schema.uploads).where(and(eq(schema.uploads.id, id), eq(schema.uploads.createdBy, adminId)));
  return row ?? null;
}

/**
 * Envoi par morceaux de 8 Mo : Traefik coupe une requête au-delà de 60 s (readTimeout), un gros fichier
 * d'un seul tenant échouerait sur une connexion lente. MinIO reste invisible depuis Internet.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const admin = await apiMember();
  if (!admin || admin.mustChangePassword) return json({ error: "Accès refusé" }, 403);
  const upload = await loadUpload((await params).id, admin.id);
  if (!upload) return json({ error: "Envoi introuvable" }, 404);
  const part = Number(request.nextUrl.searchParams.get("part"));
  if (!Number.isInteger(part) || part < 1 || part > 10_000) return json({ error: "Morceau invalide" }, 400);
  if (Number(request.headers.get("content-length")) > PART_BYTES) return json({ error: "Morceau trop grand" }, 413);
  // La taille annoncée au début n'engage à rien : chaque morceau repasse par le quota
  const [owner] = await db.select({ id: schema.documents.createdBy }).from(schema.documents).where(eq(schema.documents.id, upload.documentId));
  const previous = upload.parts.find((p) => p.PartNumber === part)?.size ?? 0;
  const refused = await quotaRefusal(admin, owner?.id ?? null, Math.max(0, (Number(request.headers.get("content-length")) || 0) - previous));
  if (refused) return refused;
  const buffer = Buffer.from(await request.arrayBuffer());
  if (!buffer.length || buffer.length > PART_BYTES) return json({ error: "Morceau invalide" }, 400);
  const total = upload.parts.filter((p) => p.PartNumber !== part).reduce((sum, p) => sum + p.size, 0) + buffer.length;
  const heavy = demoUploadRefusal(total);
  if (heavy) return heavy;
  if (total > MAX_FILE_BYTES) return json({ error: "Fichier trop volumineux" }, 413);
  const ETag = await uploadPart(upload.objectKey, upload.s3UploadId, part, buffer);
  const entry = JSON.stringify([{ PartNumber: part, ETag, size: buffer.length }]);
  // Mise à jour atomique en base : des morceaux envoyés en parallèle ne s'écrasent pas
  await db.update(schema.uploads).set({
    parts: sql`(select coalesce(jsonb_agg(p), '[]'::jsonb) from jsonb_array_elements(${schema.uploads.parts}) p where (p->>'PartNumber')::int <> ${part}) || ${entry}::jsonb`,
  }).where(eq(schema.uploads.id, upload.id));
  return json({ ok: true });
}

export async function POST(_: NextRequest, { params }: Params) {
  const admin = await apiMember();
  if (!admin || admin.mustChangePassword) return json({ error: "Accès refusé" }, 403);
  const upload = await loadUpload((await params).id, admin.id);
  if (!upload) return json({ error: "Envoi introuvable" }, 404);
  const parts = [...upload.parts].sort((a, b) => a.PartNumber - b.PartNumber);
  if (!parts.length) return json({ error: "Envoi vide" }, 400);
  await completeMultipart(upload.objectKey, upload.s3UploadId, parts.map(({ PartNumber, ETag }) => ({ PartNumber, ETag })));
  await db.delete(schema.uploads).where(eq(schema.uploads.id, upload.id));
  const size = parts.reduce((sum, p) => sum + p.size, 0);
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, upload.documentId));
  try {
    if (upload.purpose === "attachment") {
      const inlineType = sniffInline(await getHead(upload.objectKey, 16));
      // Un étudiant dépose des PDF et des images, reconnus à leur contenu et non à leur nom, et une page
      // HTML d'artefact : texte seulement, 5 Mo au plus, jamais affichée ici (/files la donne en téléchargement binaire)
      const htmlPage = !inlineType && isHtmlAttachment(upload.filename, await getHead(upload.objectKey, 8192), size);
      if (admin.role !== "admin" && !inlineType && !htmlPage) throw new ContentError("Seuls les PDF, les photos (JPEG, PNG, WebP) et les pages HTML (5 Mo) sont acceptés.");
      const scanStatus = antivirusEnabled() ? "pending" as const : "skipped" as const;
      if (inlineType?.startsWith("image/")) {
        if (size > MAX_ATTACHED_IMAGE) throw new ContentError("Image trop lourde (32 Mo maximum).");
        const object = await getObject(upload.objectKey);
        if (!object?.Body) throw new ContentError("Envoi introuvable.");
        const cleaned = await cleanImage(Buffer.from(await object.Body.transformToByteArray()));
        // L'antivirus lit l'objet final : il analyse donc la version réencodée, comme pour tout autre fichier
        const [file] = await db.insert(schema.docFiles).values({
          documentId: upload.documentId, filename: nameForType(upload.filename, cleaned.inlineType), size: cleaned.buffer.length, inlineType: cleaned.inlineType, scanStatus,
        }).returning();
        await putObject(fileKey(file.id), cleaned.buffer, "application/octet-stream");
      } else {
        const [file] = await db.insert(schema.docFiles).values({
          documentId: upload.documentId, filename: upload.filename, size, inlineType, scanStatus,
        }).returning();
        await copyObject(upload.objectKey, fileKey(file.id));
      }
      await deleteKey(upload.objectKey);
    } else if (upload.purpose === "zip") {
      await ingestZipObject(upload.documentId, upload.objectKey);
      await deleteKey(upload.objectKey);
    } else {
      if (size > 32 * 1024 * 1024) throw new ContentError("Cette page dépasse 32 Mo : utilise une archive ZIP.");
      const text = await getText(upload.objectKey) ?? "";
      await deleteKey(upload.objectKey);
      await ingestText(upload.documentId, text, doc.title, detectKind(text, upload.filename));
    }
  } catch (error) {
    await deleteKey(upload.objectKey).catch(() => undefined);
    if (error instanceof ImageRejected) return json({ error: error.message }, 415);
    if (error instanceof ContentError) return json({ error: error.message }, 400);
    throw error;
  }
  await rebuildDocumentSearch(upload.documentId);
  await audit(admin.email, "fichier_ajouté", upload.filename);
  return json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: Params) {
  const admin = await apiMember();
  if (!admin || admin.mustChangePassword) return json({ error: "Accès refusé" }, 403);
  const upload = await loadUpload((await params).id, admin.id);
  if (!upload) return json({ error: "Envoi introuvable" }, 404);
  await abortMultipart(upload.objectKey, upload.s3UploadId);
  await db.delete(schema.uploads).where(eq(schema.uploads.id, upload.id));
  return json({ ok: true });
}
