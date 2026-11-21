import "server-only";
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import type { Element, Root as HastRoot } from "hast";
import { fromHtml } from "hast-util-from-html";
import { toMdast } from "hast-util-to-mdast";
import type { Root } from "mdast";
import mammoth from "mammoth";
import { visit } from "unist-util-visit";
import { Client } from "@notionhq/client";
import { parsePageId } from "notion-utils";
import yauzl from "yauzl";
import { type Block, markdownToBlocks, sanitizeBlocks } from "./blocks";
import { extensionOf, isNotionFileUrl, sniffInline } from "./content-utils";
import { normalizeTreeToMarkdown, parser } from "./course";
import { db, schema } from "./db";
import { env } from "./env";
import { cleanImage, ImageRejected } from "./image-clean";
import { looksScanned, obsidianToMarkdown, textFromIwa } from "./import-text";
import { fileKey, putObject } from "./s3";

export class ImportError extends Error {}
/** PDF fait de photos de pages : le navigateur le fait transcrire par Campuss IA quand elle est là. */
export class ScannedPdf extends ImportError {}

const MAX_ZIP_ENTRIES = 3000;
const MAX_ZIP_BYTES = 150 * 1024 * 1024;
const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_IMAGES = 150;
const MAX_NOTES = 200;

type ImageSaver = (bytes: Buffer) => Promise<string | null>;

/** Les images passent par le même contrôle de signature qu'un envoi direct. Le reste est ignoré. */
function imageSaver(docId: string, maxBytes: number | null): ImageSaver {
  let saved = 0;
  let room = maxBytes ?? Infinity;
  return async (bytes) => {
    const inlineType = sniffInline(bytes.subarray(0, 16));
    if (!inlineType?.startsWith("image/") || bytes.length > MAX_IMAGE || saved >= MAX_IMAGES || bytes.length > room) return null;
    saved++;
    let cleaned;
    try {
      cleaned = await cleanImage(bytes);
    } catch (error) {
      if (error instanceof ImageRejected) return null;
      throw error;
    }
    room -= cleaned.buffer.length;
    const [file] = await db.insert(schema.docFiles).values({ documentId: docId, filename: "image", size: cleaned.buffer.length, inlineType: cleaned.inlineType, embedded: true }).returning();
    await putObject(fileKey(file.id), cleaned.buffer, "application/octet-stream");
    return `/files/${file.id}?inline=1`;
  };
}

/** Lit une archive en mémoire, en s'arrêtant dès qu'elle dépasse ce qu'un vrai fichier de notes contient (bombe ZIP). */
function readZip(input: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(input, { lazyEntries: true, validateEntrySizes: true, decodeStrings: true }, (error, zip) => {
      if (error || !zip) return reject(new ImportError("Cette archive est illisible."));
      const files = new Map<string, Buffer>();
      let total = 0, entries = 0;
      const stop = (message: string) => { zip.close(); reject(new ImportError(message)); };
      zip.on("error", () => stop("Cette archive est corrompue."));
      zip.on("end", () => resolve(files));
      zip.on("entry", (entry: yauzl.Entry) => {
        if (++entries > MAX_ZIP_ENTRIES) return stop("Cette archive contient trop de fichiers.");
        total += entry.uncompressedSize;
        if (total > MAX_ZIP_BYTES) return stop("Cette archive est trop volumineuse une fois décompressée.");
        if (entry.fileName.endsWith("/")) return zip.readEntry();
        zip.openReadStream(entry, (failure, stream) => {
          if (failure || !stream) return stop("Cette archive est corrompue.");
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("error", () => stop("Cette archive est corrompue."));
          stream.on("end", () => { files.set(entry.fileName, Buffer.concat(chunks)); zip.readEntry(); });
        });
      });
      zip.readEntry();
    });
  });
}

function htmlToTree(html: string): Root {
  const hast = fromHtml(html, { fragment: true }) as HastRoot;
  // Sans en-tête déclaré, la conversion ajouterait une ligne vide en haut de chaque tableau : la première ligne en tient lieu
  visit(hast, "element", (table: Element) => {
    if (table.tagName !== "table") return;
    let first: Element | undefined;
    visit(table, "element", (row: Element) => { if (!first && row.tagName === "tr") first = row; });
    for (const cell of first?.children ?? []) if (cell.type === "element" && cell.tagName === "td") cell.tagName = "th";
  });
  return toMdast(hast, {
    handlers: {
      // Word et Notion marquent ainsi le soulignement et le surlignage : on les garde
      u(state, node: Element) { return { type: "textDirective", name: "u", attributes: {}, children: state.all(node) } as never; },
      mark(state, node: Element) { return { type: "textDirective", name: "hl", attributes: { c: "yellow" }, children: state.all(node) } as never; },
    },
  }) as Root;
}

/** Remplace chaque image par sa copie Campuss, ou la retire si elle n'est pas dans le fichier importé. */
async function resolveImages(tree: Root, find: (url: string) => Buffer | undefined, save: ImageSaver) {
  const images: { url: string }[] = [];
  visit(tree, "image", (node) => { images.push(node); });
  for (const image of images) {
    const bytes = find(image.url);
    image.url = (bytes && await save(bytes)) || "";
  }
}

const finish = (tree: Root): Block[] => markdownToBlocks(normalizeTreeToMarkdown(tree));

async function fromDocx(input: Buffer, save: ImageSaver) {
  await readZip(input); // le contrôle de taille passe avant la conversion
  const { value } = await mammoth.convertToHtml({ buffer: input }, {
    styleMap: ["u => u", "highlight => mark"],
    convertImage: mammoth.images.imgElement(async (image) => {
      const bytes = Buffer.from(await image.readAsBase64String(), "base64");
      return { src: (await save(bytes)) ?? "", alt: "" };
    }),
  });
  if (!value.trim()) throw new ImportError("Ce document Word ne contient pas de texte.");
  return finish(htmlToTree(value));
}

function plainTree(paragraphs: string[]): Root {
  return { type: "root", children: paragraphs.map((text) => text.trim()).filter(Boolean).map((text) => ({ type: "paragraph", children: [{ type: "text", value: text }] })) };
}

async function fromPdf(input: Buffer) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(input));
  const { text } = await extractText(pdf, { mergePages: false });
  if (looksScanned(text as string[])) throw new ScannedPdf("Ce PDF est fait de photos de pages : il faut le transcrire.");
  const paragraphs = (text as string[]).flatMap((page) => page.split(/\n\s*\n/));
  return { blocks: finish(plainTree(paragraphs)), notes: ["Un PDF ne garde pas sa structure : ajoute les titres avec la barre de mise en page."] };
}

async function fromPages(input: Buffer, save: ImageSaver) {
  const files = await readZip(input);
  const documentEntry = [...files.keys()].find((name) => /(^|\/)Index\/Document\.iwa$/.test(name));
  if (!documentEntry) throw new ImportError("Ce fichier Pages n’a pas pu être lu. Dans Pages : Fichier, Exporter vers, Word, puis importe le fichier obtenu.");
  const texts: string[] = [];
  try {
    for (const [name, bytes] of files) if (/(^|\/)Index\/[^/]+\.iwa$/.test(name) && !/Stylesheet|Metadata|ViewState|Annotation|Tables\/|CalculationEngine/.test(name)) texts.push(...textFromIwa(bytes));
  } catch {
    throw new ImportError("Ce fichier Pages n’a pas pu être lu. Dans Pages : Fichier, Exporter vers, Word, puis importe le fichier obtenu.");
  }
  const tree = plainTree(texts.flatMap((text) => text.replace(/\uFFFC/g, "").split(/\r?\n|\u2029/)));
  if (!tree.children.length) throw new ImportError("Ce fichier Pages ne contient pas de texte lisible. Dans Pages : Fichier, Exporter vers, Word, puis importe le fichier obtenu.");
  for (const [name, bytes] of files) {
    if (/(^|\/)Data\//.test(name) && !/preview|thumb/i.test(name)) {
      const url = await save(bytes);
      if (url) tree.children.push({ type: "paragraph", children: [{ type: "image", url, alt: "" }] });
    }
  }
  return { blocks: finish(tree), notes: ["Pages ne livre que son texte : ajoute les titres avec la barre, ou exporte vers Word depuis Pages pour garder la mise en page."] };
}

async function fromEvernote(input: Buffer, save: ImageSaver) {
  const parser = new XMLParser({ ignoreAttributes: false, processEntities: false, isArray: (name) => name === "note" || name === "resource" });
  const notes = (parser.parse(input.toString("utf8"))?.["en-export"]?.note ?? []) as { title?: string; content?: string | { "#text"?: string }; resource?: { data?: string | { "#text"?: string } }[] }[];
  if (!notes.length) throw new ImportError("Ce fichier Evernote ne contient aucune note.");
  const blocks: Block[] = [];
  for (const note of notes.slice(0, MAX_NOTES)) {
    const resources = new Map<string, Buffer>();
    for (const resource of note.resource ?? []) {
      const data = typeof resource.data === "string" ? resource.data : resource.data?.["#text"];
      if (!data) continue;
      const bytes = Buffer.from(data.replace(/\s+/g, ""), "base64");
      resources.set(createHash("md5").update(bytes).digest("hex"), bytes);
    }
    const raw = typeof note.content === "string" ? note.content : note.content?.["#text"] ?? "";
    const html = raw
      .replace(/<\?xml[^>]*>|<!DOCTYPE[^>]*>/gi, "")
      .replace(/<en-media\b[^>]*\bhash="([0-9a-f]+)"[^>]*\/?>(<\/en-media>)?/gi, '<img src="cid:$1">')
      .replace(/<en-todo\b[^>]*checked="true"[^>]*\/?>(<\/en-todo>)?/gi, "☑ ")
      .replace(/<en-todo\b[^>]*\/?>(<\/en-todo>)?/gi, "☐ ")
      .replace(/<\/?en-note[^>]*>/gi, "");
    const tree = htmlToTree(html);
    await resolveImages(tree, (url) => resources.get(url.replace(/^cid:/, "")), save);
    if (notes.length > 1 && note.title) blocks.push({ type: "heading", props: { level: 2 }, content: [{ type: "text", text: String(note.title), styles: {} }] });
    blocks.push(...finish(tree));
  }
  return blocks;
}

const baseName = (path: string) => { try { return decodeURIComponent(path).split(/[\\/]/).pop()!.toLowerCase(); } catch { return path.split(/[\\/]/).pop()!.toLowerCase(); } };

async function noteTree(name: string, bytes: Buffer, files: Map<string, Buffer>, byName: Map<string, Buffer>, save: ImageSaver) {
  const text = bytes.toString("utf8");
  const tree = /\.html?$/i.test(name) ? htmlToTree(text.replace(/<head[\s\S]*?<\/head>/i, "")) : parser.parse(obsidianToMarkdown(text)) as Root;
  const folder = name.includes("/") ? name.slice(0, name.lastIndexOf("/") + 1) : "";
  await resolveImages(tree, (url) => {
    if (/^(https?:|data:)/i.test(url)) return undefined;
    let decoded = url;
    try { decoded = decodeURIComponent(url); } catch { /* adresse brute */ }
    return files.get(folder + decoded) ?? byName.get(baseName(url));
  }, save);
  return tree;
}

/** Export Notion (Markdown ou HTML) ou coffre Obsidian : une archive de notes et de leurs images. */
async function fromZip(input: Buffer, save: ImageSaver) {
  const files = await readZip(input);
  const byName = new Map([...files].map(([name, bytes]) => [baseName(name), bytes] as const));
  const notes = [...files.keys()].filter((name) => /\.(md|markdown|txt|html?)$/i.test(name) && !/(^|\/)(__MACOSX|\.obsidian|\.trash)\//.test(name) && !/index\.html$/i.test(name)).sort();
  if (!notes.length) throw new ImportError("Cette archive ne contient aucune note (fichiers .md ou .html).");
  const blocks: Block[] = [];
  for (const name of notes.slice(0, MAX_NOTES)) {
    const tree = await noteTree(name, files.get(name)!, files, byName, save);
    // Les exports Notion terminent leurs noms par un identifiant
    const title = name.split("/").pop()!.replace(/\.[^.]+$/, "").replace(/\s+[0-9a-f]{32}$/, "");
    if (notes.length > 1) blocks.push({ type: "heading", props: { level: 2 }, content: [{ type: "text", text: title, styles: {} }] });
    blocks.push(...finish(tree));
  }
  return { blocks, notes: notes.length > MAX_NOTES ? [`Seules les ${MAX_NOTES} premières notes ont été importées.`] : [] };
}

/** Convertit un fichier : le résultat est toujours un cours Campuss, jamais une copie du fichier d'origine. */
export async function importFile(docId: string, filename: string, input: Buffer, maxImageBytes: number | null = null): Promise<{ blocks: Block[]; notes: string[] }> {
  const save = imageSaver(docId, maxImageBytes);
  const extension = extensionOf(filename);
  const done = (blocks: Block[], notes: string[] = []) => ({ blocks: sanitizeBlocks(blocks), notes });
  try {
    if (extension === ".docx") return done(await fromDocx(input, save));
    if (extension === ".pages") { const r = await fromPages(input, save); return done(r.blocks, r.notes); }
    if (extension === ".pdf") { const r = await fromPdf(input); return done(r.blocks, r.notes); }
    if (extension === ".enex") return done(await fromEvernote(input, save));
    if (extension === ".zip") { const r = await fromZip(input, save); return done(r.blocks, r.notes); }
    if ([".md", ".markdown", ".txt", ".html", ".htm"].includes(extension)) {
      const tree = await noteTree(filename, input, new Map(), new Map(), save);
      return done(finish(tree));
    }
  } catch (error) {
    if (error instanceof ImportError) throw error;
    console.warn("import :", (error as Error).message);
    throw new ImportError("Ce fichier n’a pas pu être converti. Vérifie qu’il s’ouvre bien, ou exporte-le dans un autre format.");
  }
  throw new ImportError("Format non pris en charge. Formats acceptés : Word (.docx), Pages, PDF, Markdown, ZIP de notes, Evernote (.enex).");
}

// --- Page Notion, par l'intégration du site

type NotionRich = { type: string; plain_text?: string; href?: string | null; annotations?: Record<string, unknown>; equation?: { expression?: string } };
type NotionBlock = { id: string; type: string; has_children?: boolean; [key: string]: unknown };

function richText(rich: NotionRich[] | undefined) {
  return (rich ?? []).map((item) => {
    if (item.type === "equation") return { type: "math", content: item.equation?.expression ?? "" };
    const a = item.annotations ?? {};
    const color = String(a.color ?? "default");
    const styles: Record<string, unknown> = { bold: a.bold === true, italic: a.italic === true, strike: a.strikethrough === true, underline: a.underline === true, code: a.code === true };
    if (color.endsWith("_background")) styles.backgroundColor = color.replace("_background", "");
    else if (color !== "default") styles.textColor = color;
    const text = { type: "text", text: item.plain_text ?? "", styles };
    return item.href ? { type: "link", href: item.href, content: [text] } : text;
  });
}

/** Par défaut l'intégration du site (administrateurs) ; le dossier connecté passe le jeton de l'étudiant. */
export async function importNotionPage(docId: string, url: string, token = env.notionToken): Promise<Block[]> {
  if (!token) throw new ImportError("Notion n’est pas connecté.");
  const pageId = parsePageId(url, { uuid: true });
  if (!pageId) throw new ImportError("Cette adresse n’est pas celle d’une page Notion.");
  const notion = new Client({ auth: token });
  const save = imageSaver(docId, null);
  let remaining = 3000;
  async function children(id: string, depth: number): Promise<Block[]> {
    const out: Block[] = [];
    let cursor: string | undefined;
    do {
      const page = await notion.blocks.children.list({ block_id: id, page_size: 100, start_cursor: cursor }) as unknown as { results: NotionBlock[]; next_cursor: string | null };
      for (const block of page.results) {
        if (--remaining < 0) return out;
        const data = (block[block.type] ?? {}) as { rich_text?: NotionRich[]; checked?: boolean; language?: string; expression?: string; url?: string; type?: string; file?: { url?: string }; external?: { url?: string }; table_width?: number };
        const nested = block.has_children && depth < 6 && block.type !== "table" ? await children(block.id, depth + 1) : [];
        const content = richText(data.rich_text);
        switch (block.type) {
          case "paragraph": out.push({ type: "paragraph", content, children: nested }); break;
          case "heading_1": case "heading_2": out.push({ type: "heading", props: { level: 2 }, content, children: nested }); break;
          case "heading_3": out.push({ type: "heading", props: { level: 3 }, content, children: nested }); break;
          case "bulleted_list_item": out.push({ type: "bulletListItem", content, children: nested }); break;
          case "numbered_list_item": out.push({ type: "numberedListItem", content, children: nested }); break;
          case "to_do": out.push({ type: "checkListItem", props: { checked: data.checked === true }, content, children: nested }); break;
          case "toggle": out.push({ type: "toggleListItem", content, children: nested }); break;
          case "quote": out.push({ type: "quote", content, children: nested }); break;
          case "callout": out.push({ type: "callout", props: { kind: "definition" }, content, children: nested }); break;
          case "divider": out.push({ type: "divider" }); break;
          case "code": out.push({ type: "codeBlock", props: { language: data.language ?? "text" }, content }); break;
          case "equation": out.push({ type: "mathBlock", content: [{ type: "text", text: data.expression ?? "", styles: {} }] }); break;
          case "image": {
            const source = data.file?.url ?? data.external?.url ?? "";
            // Seuls les fichiers hébergés par Notion sont téléchargés : le serveur ne suit jamais une adresse arbitraire
            if (isNotionFileUrl(source)) {
              const response = await fetch(source, { redirect: "error", signal: AbortSignal.timeout(60_000) });
              const size = Number(response.headers.get("content-length") ?? 0);
              if (response.ok && size <= MAX_IMAGE) { const saved = await save(Buffer.from(await response.arrayBuffer())); if (saved) out.push({ type: "image", props: { url: saved } }); }
            }
            break;
          }
          case "video": { const source = data.external?.url ?? ""; if (source) out.push({ type: "youtube", props: { url: source } }); break; }
          case "table": {
            const rows = await notion.blocks.children.list({ block_id: block.id, page_size: 100 }) as unknown as { results: { table_row?: { cells?: NotionRich[][] } }[] };
            out.push({ type: "table", content: { rows: rows.results.map((row) => ({ cells: (row.table_row?.cells ?? []).map((cell) => richText(cell)) })) } });
            break;
          }
          case "bookmark": case "embed": case "link_preview": if (data.url) out.push({ type: "paragraph", content: [{ type: "link", href: data.url, content: [{ type: "text", text: data.url, styles: {} }] }] }); break;
          default: out.push(...nested);
        }
      }
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
    return out;
  }
  try {
    return sanitizeBlocks(await children(pageId, 0));
  } catch (error) {
    console.warn("import notion :", (error as Error).message);
    throw new ImportError("Cette page Notion n’a pas pu être lue. Vérifie qu’elle est partagée avec l’intégration Campuss.");
  }
}
