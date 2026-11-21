import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { canRead } from "@/lib/access-server";
import { mimeOf, safeRelativePath } from "@/lib/content-utils";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { notFoundResponse } from "@/lib/http";
import { ARTIFACT_PAGE_NAME, ARTIFACT_ZIP_NAME, artifactCsp } from "@/lib/rich/artifact";
import { readArtifactZipEntry } from "@/lib/rich/artifact-zip";
import { fileKey, getObject } from "@/lib/s3";
import { parseViewToken } from "@/lib/security";

// Avant tout script de la page : le stockage de remplacement (le bac à sable n'en a pas) et l'annonce de la hauteur
const PRELUDE = `<script src="/vendor/storage-shim.js"></script><script src="/vendor/embed-resize.js"></script>`;

/**
 * Un artefact inséré comme bloc, servi par l'origine de contenu (CONTENT_ORIGIN) comme /view.
 * Le jeton (document, lecteur, expiration, signature) dit qui lit ; le droit de lecture est revérifié à chaque fichier,
 * et le fichier doit être un artefact de CE document, analysé par l'antivirus. Bac à sable sans same-origin, CSP stricte.
 */
export async function GET(_: Request, { params }: { params: Promise<{ token: string; file: string; path: string[] }> }) {
  const { token, file, path } = await params;
  const parsed = parseViewToken(decodeURIComponent(token));
  const fileId = z.uuid().safeParse(file);
  if (!parsed || !fileId.success) return notFoundResponse();
  let relative: string | null;
  try {
    relative = safeRelativePath(path.map((part) => decodeURIComponent(part)).join("/"));
  } catch {
    return notFoundResponse();
  }
  if (!relative) return notFoundResponse();

  const [row] = await db.select({ file: schema.docFiles, doc: schema.documents }).from(schema.docFiles).innerJoin(schema.documents, eq(schema.docFiles.documentId, schema.documents.id))
    .where(and(eq(schema.docFiles.id, fileId.data), eq(schema.docFiles.documentId, parsed.docId), eq(schema.docFiles.embedded, true)));
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, parsed.userId));
  const suspended = Boolean(user?.suspendedUntil && user.suspendedUntil > new Date());
  if (!row || row.doc.deletedAt || user?.status !== "active" || suspended || !(await canRead(user, row.doc))) return notFoundResponse();
  if (row.file.scanStatus === "pending" || row.file.scanStatus === "infected") {
    return new Response("Cet artefact est en cours d’analyse antivirus. Recharge la page dans un instant.", { status: 423, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const object = await getObject(fileKey(row.file.id));
  if (!object?.Body) return notFoundResponse();
  let body: Buffer | null;
  if (row.file.filename === ARTIFACT_PAGE_NAME) body = relative === "index.html" ? Buffer.from(await object.Body.transformToByteArray()) : null;
  else if (row.file.filename === ARTIFACT_ZIP_NAME) body = await readArtifactZipEntry(Buffer.from(await object.Body.transformToByteArray()), relative);
  else body = null;
  if (!body) return notFoundResponse();

  const type = mimeOf(relative);
  const headers = {
    "Content-Type": type,
    "Content-Security-Policy": artifactCsp({ contentOrigin: env.contentOrigin || new URL(env.baseUrl).origin, baseOrigin: new URL(env.baseUrl).origin }),
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "private, max-age=600",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "cross-origin",
  };
  if (type.startsWith("text/html")) {
    const html = body.toString("utf-8");
    const page = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (tag) => tag + PRELUDE) : PRELUDE + html;
    return new Response(page, { headers });
  }
  return new Response(new Uint8Array(body), { headers: { ...headers, "Content-Length": String(body.length) } });
}
