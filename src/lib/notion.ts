import "server-only";
import { Client } from "@notionhq/client";
import { randomUUID } from "node:crypto";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { NotionCompatAPI } from "notion-compat";
import type { ExtendedRecordMap } from "notion-types";
import { getPageContentBlockIds, parsePageId } from "notion-utils";
import {
  extensionOf, folded, isDangerousUrl, isExpiringNotionUrl, isNotionFileUrl, mimeOf, walkStrings,
} from "./content-utils";
import { db, schema } from "./db";
import { env } from "./env";
import { deletePrefix, getText, putObject, versionPrefix } from "./s3";

const MAX_PAGES = 300;
const MAX_ASSET_BYTES = 200 * 1024 * 1024;

export const snapshotKey = (docId: string, version: string, pageId: string) =>
  `${versionPrefix(docId, version)}notion/${pageId}.json`;

/** Télécharge un fichier Notion dans le bucket : ses liens signés expirent après une heure. */
async function copyAsset(url: string, prefix: string, docId: string, version: string) {
  // redirect "error" : une redirection ne peut pas envoyer le serveur vers le réseau interne (SSRF)
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new Error(`fichier Notion inaccessible (${response.status})`);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.length;
    if (total > MAX_ASSET_BYTES) throw new Error("fichier Notion trop volumineux");
    chunks.push(chunk);
  }
  const extension = extensionOf(new URL(url).pathname).replace(/[^.a-z0-9]/g, "").slice(0, 10);
  const name = `${randomUUID()}${extension}`;
  await putObject(`${prefix}assets/${name}`, Buffer.concat(chunks), mimeOf(name));
  return `/notion-asset/${docId}/${version}/${name}`;
}

/** Le contenu vient d'un service externe : les URL dangereuses sont neutralisées avant tout rendu. */
export async function sanitizeRecordMap(
  recordMap: ExtendedRecordMap, copy: (url: string) => Promise<string>,
): Promise<ExtendedRecordMap> {
  const pending = new Map<string, Promise<string>>();
  walkStrings(recordMap, (text) => {
    if (isExpiringNotionUrl(text) && !pending.has(text)) pending.set(text, copy(text));
    return text;
  });
  const copied = new Map<string, string>();
  for (const [url, local] of pending) copied.set(url, await local);
  const clean = walkStrings(recordMap, (text, isLink) => {
    if (copied.has(text)) return copied.get(text)!;
    if (isLink && isDangerousUrl(text)) return "#";
    // Lien signé non reconnu : on préfère un lien mort à une fuite d'URL temporaire
    return isNotionFileUrl(text) && text.includes("X-Amz-") ? "#" : text;
  }) as ExtendedRecordMap;
  clean.signed_urls = {};
  return clean;
}

// Selon la version, un bloc est sous .value ou sous .value.value
function blockOf(recordMap: ExtendedRecordMap, id: string) {
  const entry = recordMap.block[id]?.value as unknown as { type?: string; value?: { type?: string } } | undefined;
  return (entry?.value ?? entry) as { type?: string; properties?: { title?: unknown[][] } } | undefined;
}

function childPageIds(recordMap: ExtendedRecordMap, rootId: string): string[] {
  const root = parsePageId(rootId, { uuid: true })!;
  const ids = getPageContentBlockIds(recordMap, root);
  return ids.flatMap((id) => {
    return blockOf(recordMap, id)?.type === "page" && id !== root ? [id.replace(/-/g, "")] : [];
  });
}

export type NotionDatabase = { title: string; columns: string[]; rows: { id: string; cells: string[] }[] };

const plainText = (items: unknown) => (Array.isArray(items) ? items.map((t) => String((t as { plain_text?: string }).plain_text ?? "")).join("") : "");

function propertyText(prop: Record<string, unknown> | undefined): string {
  if (!prop) return "";
  const value = prop[String(prop.type)] as unknown;
  switch (prop.type) {
    case "title": case "rich_text": return plainText(value);
    case "select": case "status": return String((value as { name?: string } | null)?.name ?? "");
    case "multi_select": return (value as { name: string }[]).map((v) => v.name).join(", ");
    case "date": return String((value as { start?: string } | null)?.start ?? "");
    case "number": case "url": case "email": case "phone_number": return value == null ? "" : String(value);
    case "checkbox": return value ? "Oui" : "Non";
    default: return "";
  }
}

/** Les bases Notion d'une page deviennent des tableaux copiés ici ; chaque ligne est aussi une page importée. */
async function readDatabases(client: Client, pageId: string): Promise<NotionDatabase[]> {
  const out: NotionDatabase[] = [];
  let cursor: string | undefined;
  do {
    const list = await client.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 });
    for (const block of list.results as { id: string; type?: string; child_database?: { title?: string } }[]) {
      if (block.type !== "child_database") continue;
      // Une base liée à une autre page n'est pas toujours accessible : le reste de l'import continue
      const result = await client.databases.query({ database_id: block.id, page_size: 100 }).catch(() => null);
      if (!result) continue;
      const pages = result.results as { id: string; properties?: Record<string, Record<string, unknown>> }[];
      const columns = [...new Set(pages.flatMap((p) => Object.keys(p.properties ?? {})))].slice(0, 8);
      columns.sort((a, b) => Number(pages[0]?.properties?.[b]?.type === "title") - Number(pages[0]?.properties?.[a]?.type === "title"));
      out.push({ title: block.child_database?.title || "Base de données", columns, rows: pages.map((p) => ({ id: p.id.replace(/-/g, ""), cells: columns.map((c) => propertyText(p.properties?.[c]).slice(0, 300)) })) });
    }
    cursor = list.has_more ? list.next_cursor ?? undefined : undefined;
  } while (cursor);
  return out;
}

export async function loadDatabases(docId: string, version: string, pageId: string): Promise<NotionDatabase[]> {
  const text = await getText(`${versionPrefix(docId, version)}notion/${pageId}.db.json`);
  return text ? JSON.parse(text) as NotionDatabase[] : [];
}

export async function syncNotionDocument(docId: string, rootPageId: string, client?: Client) {
  if (!env.notionToken && !client) throw new Error("NOTION_TOKEN n’est pas configuré.");
  const notion = client ?? new Client({ auth: env.notionToken });
  const api = new NotionCompatAPI(notion);
  const version = randomUUID();
  const prefix = versionPrefix(docId, version);
  const textParts: string[] = [];
  try {
    const queue = [rootPageId];
    const seen = new Set<string>();
    while (queue.length) {
      const pageId = queue.shift()!;
      if (seen.has(pageId)) continue;
      seen.add(pageId);
      if (seen.size > MAX_PAGES) throw new Error(`plus de ${MAX_PAGES} sous-pages`);
      const raw = await api.getPage(pageId);
      queue.push(...childPageIds(raw, pageId));
      const databases = await readDatabases(notion, pageId);
      if (databases.length) {
        await putObject(`${prefix}notion/${pageId}.db.json`, JSON.stringify(databases), "application/json");
        queue.push(...databases.flatMap((d) => d.rows.map((r) => r.id)));
        textParts.push(...databases.flatMap((d) => d.rows.flatMap((r) => r.cells)));
      }
      const clean = await sanitizeRecordMap(raw, (url) => copyAsset(url, prefix, docId, version));
      for (const id of Object.keys(clean.block)) {
        const title = blockOf(clean, id)?.properties?.title;
        if (Array.isArray(title)) textParts.push(title.map((part) => String(part?.[0] ?? "")).join(""));
      }
      await putObject(snapshotKey(docId, version, pageId), JSON.stringify(clean), "application/json");
    }
    return { version, text: folded(textParts.join(" ")).slice(0, 200_000) };
  } catch (error) {
    await deletePrefix(prefix).catch(() => undefined);
    throw error;
  }
}

export async function loadSnapshot(docId: string, version: string, pageId: string): Promise<ExtendedRecordMap | null> {
  const text = await getText(snapshotKey(docId, version, pageId));
  return text ? JSON.parse(text) as ExtendedRecordMap : null;
}

function describeNotionError(error: unknown) {
  const code = (error as { code?: string }).code;
  if (code === "unauthorized") return "Jeton Notion refusé : vérifie NOTION_TOKEN.";
  if (code === "object_not_found") return "Page introuvable : ajoute l’intégration à la page (menu ⋯, Connexions).";
  return `Synchronisation impossible : ${String((error as Error).message).slice(0, 300)}`;
}

/** Une panne de Notion laisse la version précédente en ligne ; nouvel essai à l'échéance suivante. */
export async function runDueNotionSyncs() {
  const dayAgo = new Date(Date.now() - 86_400_000);
  const due = await db.select().from(schema.documents).where(and(isNull(schema.documents.deletedAt), 
    eq(schema.documents.kind, "notion"),
    or(eq(schema.documents.syncRequested, true), isNull(schema.documents.syncedAt), lt(schema.documents.syncedAt, dayAgo)),
  ));
  for (const doc of due) {
    if (!doc.notionPageId) continue;
    try {
      const { version, text } = await syncNotionDocument(doc.id, doc.notionPageId);
      await db.update(schema.documents).set({
        contentVersion: version, entryPath: null, bodyText: text, syncedAt: new Date(), syncError: null,
        syncRequested: false,
        searchText: folded(`${doc.title} ${doc.description} ${doc.academicYear} ${doc.teacherName} ${text}`),
      }).where(eq(schema.documents.id, doc.id));
      if (doc.contentVersion) await deletePrefix(versionPrefix(doc.id, doc.contentVersion));
    } catch (error) {
      console.warn("notion : synchronisation échouée", doc.id, (error as Error).message);
      await db.update(schema.documents).set({
        syncError: describeNotionError(error).slice(0, 500), syncedAt: new Date(), syncRequested: false,
      }).where(eq(schema.documents.id, doc.id));
    }
  }
}
