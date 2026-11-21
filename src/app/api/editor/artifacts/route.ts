import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { canEdit } from "@/lib/access-server";
import { apiMember } from "@/lib/auth";
import { antivirusEnabled } from "@/lib/clamav";
import { pageFromText } from "@/lib/content";
import { ContentError, detectKind, extensionOf } from "@/lib/content-utils";
import { db, schema } from "@/lib/db";
import { demoUploadRefusal } from "@/lib/demo";
import { json } from "@/lib/http";
import { ARTIFACT_PAGE_NAME, ARTIFACT_ZIP_NAME, MAX_ARTIFACT_TEXT, MAX_ARTIFACT_ZIP } from "@/lib/rich/artifact";
import { inspectArtifactZip } from "@/lib/rich/artifact-zip";
import { fileKey, putObject } from "@/lib/s3";
import { rateHit, rateLimited } from "@/lib/security";
import { quotaRefusal } from "@/lib/storage-usage";

const decodeName = (raw: string | null) => { try { return decodeURIComponent(raw ?? ""); } catch { return ""; } };
const TEXT_EXTENSIONS = [".html", ".htm", ".jsx", ".tsx", ".md", ".markdown", ""];

/**
 * Un artefact HTML inséré comme bloc dans un cours. Même chemin que « Coller un artefact » et l'import
 * d'une page ou d'une archive (lib/content.ts) : code collé ou fichier .html/.jsx/.tsx/.md, ou archive .zip.
 * Protections : auteur du brouillon seulement (pas de proposition de modification), débit, quota d'espace, taille,
 * chemins sûrs de l'archive, analyse antivirus (le fichier reste illisible tant qu'elle n'est pas faite).
 * Le fichier n'est jamais servi par l'origine principale : /files le donne en téléchargement binaire, /embed (origine de
 * contenu) l'affiche dans un bac à sable.
 */
export async function POST(request: NextRequest) {
  const user = await apiMember();
  const id = z.uuid().safeParse(request.nextUrl.searchParams.get("doc"));
  if (!user || user.mustChangePassword || !id.success) return json({ error: "Accès refusé" }, 403);
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, id.data));
  if (!doc || doc.deletedAt || !(await canEdit(user, doc))) return json({ error: "Accès refusé" }, 403);
  const key = `editor-artifact:${user.id}`;
  if (await rateLimited(key, 30, 60)) return json({ error: "Trop d’artefacts envoyés. Réessaie plus tard." }, 429);
  const length = Number(request.headers.get("content-length")) || 0;
  const heavy = demoUploadRefusal(length);
  if (heavy) return heavy;
  if (length > MAX_ARTIFACT_ZIP) return json({ error: "Artefact trop lourd (10 Mo maximum pour une archive, 2 Mo pour une page)." }, 413);
  const refused = await quotaRefusal(user, doc.createdBy, length);
  if (refused) return refused;
  const filename = decodeName(request.headers.get("x-filename")).slice(0, 255);
  const extension = extensionOf(filename);
  const received = Buffer.from(await request.arrayBuffer());
  await rateHit(key);
  try {
    let stored: Buffer;
    let name: string;
    let entry = "index.html";
    if (extension === ".zip") {
      if (received.length > MAX_ARTIFACT_ZIP) return json({ error: "Archive trop lourde (10 Mo maximum)." }, 413);
      entry = await inspectArtifactZip(received);
      stored = received;
      name = ARTIFACT_ZIP_NAME;
    } else if (TEXT_EXTENSIONS.includes(extension)) {
      if (received.length > MAX_ARTIFACT_TEXT) return json({ error: "Page trop lourde (2 Mo maximum) : utilise une archive ZIP." }, 413);
      const text = received.toString("utf8");
      if (!text.trim()) return json({ error: "Colle le code de l’artefact." }, 400);
      if (text.includes("\0")) return json({ error: "Ce fichier n’est pas du texte." }, 415);
      stored = Buffer.from(await pageFromText(text, doc.title || "Artefact", detectKind(text, filename)), "utf8");
      name = ARTIFACT_PAGE_NAME;
    } else {
      return json({ error: "Formats acceptés : HTML, JSX ou TSX (React), Markdown, ou une archive ZIP." }, 415);
    }
    const [file] = await db.insert(schema.docFiles).values({
      documentId: doc.id, filename: name, size: stored.length, inlineType: null, embedded: true, ...(antivirusEnabled() ? { scanStatus: "pending" } : {}),
    }).returning();
    await putObject(fileKey(file.id), stored, "application/octet-stream");
    return json({ src: `/files/${file.id}`, entry, scanning: file.scanStatus === "pending" });
  } catch (error) {
    if (error instanceof ContentError) return json({ error: error.message }, 400);
    throw error;
  }
}
