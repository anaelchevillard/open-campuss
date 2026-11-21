import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { canEdit } from "@/lib/access-server";
import { apiMember } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { demoUploadRefusal } from "@/lib/demo";
import { json } from "@/lib/http";
import { ImportError, importFile, importNotionPage, ScannedPdf } from "@/lib/import";
import { ConnectionLost, downloadGoogleFile, FileTooLarge } from "@/lib/connected/providers";
import { fileNameFor, isProvider, type Provider, titleFrom } from "@/lib/connected/rules";
import { accessTokenOf } from "@/lib/connected/scan";
import { folderOf, importProviders } from "@/lib/connected/status";
import type { User } from "@/lib/db/schema";
import { IMPORT_STREAM_TYPE } from "@/lib/import-client";
import { rateHit, rateLimited } from "@/lib/security";
import { importQueue } from "@/lib/import-queue";
import { QueueFullError, QueueTimeoutError } from "@/lib/serial-queue";
import { quotaLeft, quotaRefusal } from "@/lib/storage-usage";

const MAX_FILE = 16 * 1024 * 1024;
const BUSY = "Beaucoup d’imports en ce moment. Réessaie dans une minute.";

const queue = importQueue;

function failure(error: unknown) {
  if (error instanceof QueueFullError || error instanceof QueueTimeoutError) return { status: 503, body: { error: BUSY } };
  if (error instanceof ScannedPdf) return { status: 422, body: { error: error.message, scanned: true } };
  if (error instanceof ImportError) return { status: 422, body: { error: error.message } };
  if (error instanceof FileTooLarge) return { status: 413, body: { error: "Ce document dépasse 16 Mo." } };
  if (error instanceof ConnectionLost) return { status: 409, body: { error: "L’accès à ton compte a été retiré : reconnecte-le.", lost: true } };
  console.error("import :", error);
  return { status: 500, body: { error: "L’import a échoué." } };
}

/** Sans attente, une réponse ordinaire. Sinon le corps part tout de suite pour que le navigateur sache qu'il patiente. */
function respond(work: () => Promise<unknown>) {
  if (!queue.busy) return queue.run(work).then((body) => json(body), (error) => { const { status, body } = failure(error); return json(body, status); });
  if (queue.full) return json({ error: BUSY }, 503);
  const encoder = new TextEncoder();
  const abort = new AbortController();
  const stream = new ReadableStream({
    start(controller) {
      const send = (message: unknown) => { try { controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`)); } catch { /* navigateur parti */ } };
      send({ phase: "waiting" });
      void queue.run(() => { send({ phase: "running" }); return work(); }, abort.signal)
        .then((body) => send({ status: 200, body }), (error) => { if (!abort.signal.aborted) send(failure(error)); })
        .finally(() => { try { controller.close(); } catch { /* navigateur parti */ } });
    },
    cancel() { abort.abort(); },
  });
  return new Response(stream, { headers: { "Content-Type": `${IMPORT_STREAM_TYPE}; charset=utf-8`, "Cache-Control": "no-store, no-transform" } });
}

const GOOGLE_DOC = "application/vnd.google-apps.document";
const sourceBody = z.object({
  documentId: z.uuid().optional(),
  source: z.object({ provider: z.string().refine(isProvider), id: z.string().regex(/^[\w-]{1,100}$/), title: z.string().max(300).default("") }),
});

/** Une page du compte de l'étudiant, avec son propre jeton. Retenue comme « Déjà importé » pour le sélecteur. */
async function importSource(user: User, docId: string, room: number | null, provider: Provider, externalId: string, rawTitle: string) {
  const folder = await folderOf(user.id, provider);
  if (!folder) throw new ImportError("Connecte d’abord ton compte.");
  const title = titleFrom(rawTitle);
  try {
    const token = await accessTokenOf(folder);
    const result = provider === "notion"
      ? { blocks: await importNotionPage(docId, externalId, token), notes: [] as string[] }
      : await importFile(docId, fileNameFor(title, GOOGLE_DOC), await downloadGoogleFile(token, externalId, GOOGLE_DOC), room);
    await db.insert(schema.connectedItems).values({ folderId: folder.id, externalId, title, mime: provider === "notion" ? "notion" : GOOGLE_DOC, status: "shared", documentId: docId, importedByHand: true })
      .onConflictDoUpdate({ target: [schema.connectedItems.folderId, schema.connectedItems.externalId], set: { status: "shared", documentId: docId, importedByHand: true, title } });
    return { ...result, title };
  } catch (error) {
    if (error instanceof ConnectionLost) await db.update(schema.connectedFolders).set({ brokenAt: new Date() }).where(eq(schema.connectedFolders.id, folder.id));
    throw error;
  }
}

/** Convertit des notes vers le format Campuss. Le fichier d'origine n'est jamais conservé. */
export async function POST(request: NextRequest) {
  const user = await apiMember();
  const isJson = request.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await request.json().catch(() => ({})) as Record<string, unknown> : {};
  const id = z.uuid().safeParse(request.nextUrl.searchParams.get("doc") ?? payload.documentId);
  if (!user || user.mustChangePassword || !id.success) return json({ error: "Accès refusé" }, 403);
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, id.data));
  if (!doc || !(await canEdit(user, doc))) return json({ error: "Accès refusé" }, 403);
  const key = `import:${user.id}`;
  if (await rateLimited(key, 30, 1440)) return json({ error: "Trop d’imports aujourd’hui. Réessaie demain." }, 429);
  // File pleine : on refuse avant de lire le fichier et sans décompter l'essai
  if (queue.full) return json({ error: BUSY }, 503);
  await rateHit(key);
  try {
    if (isJson && payload.source) {
      const parsed = sourceBody.safeParse(payload);
      if (!parsed.success || !(await importProviders()).includes(parsed.data.source.provider as Provider)) return json({ error: "Import refusé." }, 400);
      const refused = await quotaRefusal(user, doc.createdBy, 0);
      if (refused) return refused;
      const { provider, id: externalId, title } = parsed.data.source;
      const room = await quotaLeft(user, doc.createdBy);
      return await respond(() => importSource(user, doc.id, room, provider as Provider, externalId, title));
    }
    if (isJson) {
      // L'intégration Notion du site voit des pages privées : seul un administrateur peut s'en servir
      if (user.role !== "admin") return json({ error: "Accès refusé" }, 403);
      const { notionUrl } = payload as { notionUrl?: string };
      return await respond(async () => ({ blocks: await importNotionPage(doc.id, String(notionUrl ?? "")), notes: [] }));
    }
    const heavy = demoUploadRefusal(request.headers.get("content-length"));
    if (heavy) return heavy;
    if (Number(request.headers.get("content-length")) > MAX_FILE) return json({ error: "Fichier trop lourd (16 Mo maximum)." }, 413);
    // Le fichier d'origine n'est pas conservé : seul un espace déjà plein bloque, et les images suivent ce qui reste
    const refused = await quotaRefusal(user, doc.createdBy, 0);
    if (refused) return refused;
    const buffer = Buffer.from(await request.arrayBuffer());
    const heavyBody = demoUploadRefusal(buffer.length);
    if (heavyBody) return heavyBody;
    if (buffer.length > MAX_FILE) return json({ error: "Fichier trop lourd (16 Mo maximum)." }, 413);
    let name = "";
    try { name = decodeURIComponent(request.headers.get("x-filename") ?? ""); } catch { /* nom invalide */ }
    return await respond(async () => importFile(doc.id, name, buffer, await quotaLeft(user, doc.createdBy)));
  } catch (error) {
    if (error instanceof ImportError || error instanceof FileTooLarge || error instanceof ConnectionLost) { const { status, body } = failure(error); return json(body, status); }
    throw error;
  }
}
