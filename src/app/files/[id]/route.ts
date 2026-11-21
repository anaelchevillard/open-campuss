import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import type { Readable } from "node:stream";
import { z } from "zod";
import { canRead } from "@/lib/access-server";
import { currentUser } from "@/lib/auth";
import { contentDisposition } from "@/lib/content-utils";
import { db, schema } from "@/lib/db";
import { downloadRefusal } from "@/lib/download-guard";
import { countsAsDownload } from "@/lib/download-rules";
import { nodeToWeb, notFoundResponse } from "@/lib/http";
import { fileKey, getObject } from "@/lib/s3";
import { watermarkPdf } from "@/lib/watermark";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return notFoundResponse();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return notFoundResponse();
  const [row] = await db.select({ file: schema.docFiles, doc: schema.documents })
    .from(schema.docFiles).innerJoin(schema.documents, eq(schema.docFiles.documentId, schema.documents.id))
    .where(and(eq(schema.docFiles.id, id.data)));
  // Droit vérifié sur le document : connaître l'identifiant d'un fichier d'une autre licence ne suffit pas
  if (!row || !(await canRead(user, row.doc))) return notFoundResponse();

  // En attente d'analyse ou infecté : personne ne le récupère, sauf les modérateurs qui ont besoin de voir une demande
  if (row.file.scanStatus === "pending" || row.file.scanStatus === "infected") {
    return new Response("Ce fichier est en cours d’analyse antivirus. Réessaie dans un instant.", { status: 423, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const inline = request.nextUrl.searchParams.get("inline") === "1" && row.file.inlineType;
  const partial = Boolean(inline && /^(video|audio)\//.test(row.file.inlineType ?? "") && /^bytes=\d+-\d*$/.test(request.headers.get("range") ?? ""));
  if (countsAsDownload(row.file, row.doc, user, partial)) {
    const refused = await downloadRefusal(user);
    if (refused) return refused;
  }
  if (!row.file.embedded && (user.trackingConsent ?? request.cookies.get("campuss-consent")?.value) === "yes") {
    await db.insert(schema.pageViews).values({ path: `/d/${row.doc.id}/fichier`, userId: user.id, device: "", browser: "" }).catch(() => undefined);
  }
  // Lecture partielle : sans elle, Safari refuse de lire une vidéo et personne ne peut avancer dedans
  const range = inline && /^(video|audio)\//.test(row.file.inlineType ?? "") ? request.headers.get("range")?.match(/^bytes=(\d+)-(\d*)$/) : null;
  if (range) {
    const start = Number(range[1]);
    const end = Math.min(range[2] ? Number(range[2]) : row.file.size - 1, row.file.size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${row.file.size}` } });
    const part = await getObject(fileKey(row.file.id), `bytes=${start}-${end}`);
    if (!part?.Body) return notFoundResponse();
    return new Response(nodeToWeb(part.Body as Readable), { status: 206, headers: {
      "Content-Type": row.file.inlineType!, "Content-Range": `bytes ${start}-${end}/${row.file.size}`, "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'",
    } });
  }
  const object = await getObject(fileKey(row.file.id));
  if (!object?.Body) return notFoundResponse();
  const headers = (type: string, length: number) => ({
    "Content-Type": type,
    "Content-Disposition": contentDisposition(inline ? "inline" : "attachment", row.file.filename),
    "Content-Length": String(length),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; object-src 'self'; frame-ancestors 'self'",
  });
  // Filigrane au nom du lecteur, sauf pour l'auteur et l'administrateur. Les très gros PDF restent tels quels (mémoire).
  if (row.file.inlineType === "application/pdf" && row.file.size <= 30 * 1024 * 1024 && user.role !== "admin" && row.doc.createdBy !== user.id) {
    const stamped = await watermarkPdf(await object.Body.transformToByteArray(), user.name);
    const bytes = stamped ?? await (await getObject(fileKey(row.file.id)))!.Body!.transformToByteArray();
    return new Response(Buffer.from(bytes), { headers: headers(inline ? "application/pdf" : "application/octet-stream", bytes.length) });
  }
  return new Response(nodeToWeb(object.Body as Readable), {
    headers: {
      // Sans signature vérifiée : téléchargement forcé en binaire. Un .html ou .svg joint ne s'exécute jamais ici.
      "Content-Type": inline ? row.file.inlineType! : "application/octet-stream",
      "Content-Disposition": contentDisposition(inline ? "inline" : "attachment", row.file.filename),
      "Content-Length": String(row.file.size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; object-src 'self'; frame-ancestors 'self'",
    },
  });
}
