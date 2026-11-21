import { eq } from "drizzle-orm";
import { z } from "zod";
import { canEdit } from "@/lib/access-server";
import { apiAdmin, apiMember } from "@/lib/auth";
import { rateHit, rateLimited } from "@/lib/security";
import { quotaRefusal } from "@/lib/storage-usage";
import { cleanFilename } from "@/lib/content-utils";
import { db, schema } from "@/lib/db";
import { MAX_FILE_BYTES, MAX_STUDENT_FILE_BYTES } from "@/lib/env";
import { demoUploadRefusal } from "@/lib/demo";
import { json } from "@/lib/http";
import { startMultipart, uploadKey } from "@/lib/s3";
import { randomUUID } from "node:crypto";

const body = z.object({
  documentId: z.uuid(),
  purpose: z.enum(["attachment", "page", "zip"]),
  filename: z.string().min(1).max(1000),
  size: z.number().int().positive().max(MAX_FILE_BYTES),
});

export async function POST(request: Request) {
  const uploader = await apiMember();
  if (!uploader || uploader.mustChangePassword) return json({ error: "Accès refusé" }, 403);
  const isAdmin = Boolean(await apiAdmin());
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Fichier refusé (200 Mo maximum)." }, 400);
  const { documentId, purpose, filename } = parsed.data;
  const heavy = demoUploadRefusal(parsed.data.size);
  if (heavy) return heavy;
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, documentId));
  if (!doc) return json({ error: "Document introuvable" }, 404);
  // Un étudiant ne joint que des fichiers (PDF, photos) à son propre brouillon : ni page HTML, ni archive
  if (!isAdmin) {
    if (!(await canEdit(uploader, doc)) || purpose !== "attachment") return json({ error: "Accès refusé" }, 403);
    if (parsed.data.size > MAX_STUDENT_FILE_BYTES) return json({ error: "Fichier trop lourd (50 Mo maximum)." }, 413);
    const refused = await quotaRefusal(uploader, doc.createdBy, parsed.data.size);
    if (refused) return refused;
    const key = `upload:${uploader.id}`;
    if (await rateLimited(key, 40, 1440)) return json({ error: "Trop de fichiers envoyés aujourd’hui." }, 429);
    await rateHit(key);
  }
  const id = randomUUID();
  const objectKey = uploadKey(id);
  const s3UploadId = await startMultipart(objectKey);
  await db.insert(schema.uploads).values({
    id, documentId, createdBy: uploader.id, purpose, filename: cleanFilename(filename), objectKey, s3UploadId,
  });
  return json({ id });
}
