import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextRequest } from "next/server";
import { contentDisposition } from "@/lib/content-utils";

// Dossier déposé à la main sur le serveur (dossier `partage` de CAMPUS_ROOT), monté en lecture seule. Public, sans compte, jamais indexé.
const ROOT = process.env.SHARE_DIR ?? "/partage";

// Seuls ces types s'ouvrent dans le navigateur ; HTML, SVG et le reste se téléchargent, pour ne rien exécuter sur le domaine
const INLINE: Record<string, string> = {
  ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".txt": "text/plain; charset=utf-8",
};

const BASE_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; object-src 'self'; frame-ancestors 'self'",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "public, max-age=300",
};

const notFound = () => new Response("Introuvable", { status: 404, headers: { ...BASE_HEADERS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

async function resolve(segments: string[]) {
  // Ni fichier caché, ni remontée de dossier : seulement ce qui est réellement sous ROOT, liens symboliques compris
  if (segments.some((s) => !s || s.startsWith(".") || s.includes("\0"))) return null;
  try {
    const root = await realpath(ROOT);
    const file = await realpath(path.join(root, ...segments));
    if (!file.startsWith(root + path.sep)) return null;
    const info = await stat(file);
    return info.isFile() ? { file, size: info.size, mtime: info.mtime } : null;
  } catch {
    return null;
  }
}

async function serve(request: NextRequest, params: Promise<{ path: string[] }>, head: boolean) {
  const found = await resolve((await params).path);
  if (!found) return notFound();
  const name = path.basename(found.file);
  const inlineType = INLINE[path.extname(name).toLowerCase()];
  const headers: Record<string, string> = {
    ...BASE_HEADERS,
    "Content-Type": inlineType ?? "application/octet-stream",
    "Content-Disposition": contentDisposition(inlineType ? "inline" : "attachment", name),
    "Last-Modified": found.mtime.toUTCString(),
    "Accept-Ranges": "bytes",
  };
  // Lecture partielle : nécessaire pour avancer dans une vidéo et pour les gros PDF
  const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, found.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), found.size - 1) : found.size - 1;
    if (start > end || start >= found.size) return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${found.size}` } });
    headers["Content-Range"] = `bytes ${start}-${end}/${found.size}`;
    headers["Content-Length"] = String(end - start + 1);
    return new Response(head ? null : (Readable.toWeb(createReadStream(found.file, { start, end })) as ReadableStream), { status: 206, headers });
  }
  headers["Content-Length"] = String(found.size);
  return new Response(head ? null : (Readable.toWeb(createReadStream(found.file)) as ReadableStream), { headers });
}

export function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return serve(request, params, false);
}

export function HEAD(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return serve(request, params, true);
}
