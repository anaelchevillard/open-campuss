import "server-only";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { eq } from "drizzle-orm";
import { marked } from "marked";
import yauzl from "yauzl";
import {
  chooseEntry, ContentError, extensionOf, folded, htmlToText, isJunkZipEntry, mimeOf, safeRelativePath, type TextKind,
} from "./content-utils";
import { db, schema } from "./db";
import { env, MAX_ZIP_EXTRACTED_BYTES } from "./env";
import { deletePrefix, getObject, putObject, versionPrefix } from "./s3";

const SEARCH_LIMIT = 200_000;
const MAX_ZIP_ENTRIES = 10_000;

const lib = (name: string) => `/vendor/lib/${name}.js`;
const IMPORT_MAP = { imports: {
  react: lib("react"), "react/jsx-runtime": lib("react-jsx-runtime"), "react-dom": lib("react-dom"), "react-dom/client": lib("react-dom-client"),
  "lucide-react": lib("lucide-react"), recharts: lib("recharts"), lodash: lib("lodash"), d3: lib("d3"), mathjs: lib("mathjs"), papaparse: lib("papaparse"),
} };

function artifactPage(source: string) {
  const json = JSON.stringify(source).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="/vendor/lib/tailwind.js"></script>
<script type="importmap">${JSON.stringify(IMPORT_MAP)}</script>
<script src="/vendor/lib/babel.min.js"></script>
</head><body><div id="root"></div>
<script type="application/json" id="source">${json}</script>
<script type="module">
try {
  const source = JSON.parse(document.getElementById('source').textContent);
  const { code } = Babel.transform(source, { filename: 'artifact.tsx',
    presets: [['react', { runtime: 'automatic' }], 'typescript'] });
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  const [{ default: App }, { createRoot }, { createElement }] = await Promise.all(
    [import(url), import('react-dom/client'), import('react')]);
  createRoot(document.getElementById('root')).render(createElement(App));
} catch (e) {
  const pre = document.createElement('pre');
  pre.style.cssText = 'padding:1rem;color:#b00020;white-space:pre-wrap';
  pre.textContent = "Impossible d'afficher cet artefact :\\n" + e;
  document.getElementById('root').replaceChildren(pre);
}
</script></body></html>`;
}

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

async function markdownPage(text: string, title: string) {
  const body = await marked.parse(text);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title><style>:root{color-scheme:light dark}body{font:17px/1.65 Georgia,serif;max-width:46rem;margin:2rem auto;padding:0 1rem}
pre{overflow:auto;padding:1rem;background:#8882;border-radius:6px}table{border-collapse:collapse}td,th{border:1px solid #8886;padding:.3rem .6rem}img{max-width:100%}</style>
</head><body>${body}</body></html>`;
}

export function refreshSearchText(parts: { title: string; subject?: string | null; description: string; academicYear: string; teacher?: string; files: string[]; body: string }) {
  return folded([parts.title, parts.subject ?? "", parts.description, parts.academicYear, parts.teacher ?? "", ...parts.files, parts.body].join(" "));
}

/** Écrit puis bascule la version en une seule mise à jour SQL ; l'ancienne n'est supprimée qu'ensuite. */
async function activateVersion(docId: string, version: string, kind: string, entryPath: string, bodyText: string) {
  const [previous] = await db.select({ version: schema.documents.contentVersion }).from(schema.documents).where(eq(schema.documents.id, docId));
  await db.update(schema.documents).set({
    kind, contentVersion: version, entryPath, bodyText: bodyText.slice(0, SEARCH_LIMIT), updatedAt: new Date(),
    notionPageId: null, syncRequested: false, syncedAt: null, syncError: null,
  }).where(eq(schema.documents.id, docId));
  if (previous?.version) await deletePrefix(versionPrefix(docId, previous.version));
}

/** La page HTML d'un texte collé ou envoyé : telle quelle, artefact React compilé dans le navigateur, ou Markdown mis en page. */
export async function pageFromText(text: string, title: string, kind: TextKind) {
  return kind === "html" ? text : kind === "artifact" ? artifactPage(text) : await markdownPage(text, title);
}

export async function ingestText(docId: string, text: string, title: string, kind: TextKind) {
  const page = await pageFromText(text, title, kind);
  const version = randomUUID();
  await putObject(`${versionPrefix(docId, version)}index.html`, page, "text/html; charset=utf-8");
  await activateVersion(docId, version, kind, "index.html", kind === "artifact" ? text : htmlToText(page));
}

type Budget = { bytes: number; entries: number; paths: string[]; text: string[]; textSize: number };

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    // validateEntrySizes : le flux échoue si la taille réelle dépasse celle annoncée (bombe de décompression)
    yauzl.open(path, { lazyEntries: true, validateEntrySizes: true, strictFileNames: false, decodeStrings: true }, (error, zip) => {
      if (error || !zip) reject(new ContentError("Cette archive ZIP est illisible."));
      else resolve(zip);
    });
  });
}

const entryStream = (zip: yauzl.ZipFile, entry: yauzl.Entry) => new Promise<Readable>((resolve, reject) => {
  zip.openReadStream(entry, (error, stream) => (error || !stream ? reject(new ContentError("Archive corrompue.")) : resolve(stream)));
});

async function readStream(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

async function extractZip(zipPath: string, prefix: string, budget: Budget, workDir: string, allowNested: boolean) {
  const zip = await openZip(zipPath);
  await new Promise<void>((resolve, reject) => {
    zip.on("error", () => reject(new ContentError("Archive corrompue.")));
    zip.on("end", resolve);
    zip.on("entry", async (entry: yauzl.Entry) => {
      try {
        const relative = safeRelativePath(entry.fileName);
        const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
        // Dossiers, liens symboliques et chemins sortants (zip slip) ne sont jamais écrits
        if (entry.fileName.endsWith("/") || mode === 0o120000 || !relative || isJunkZipEntry(relative)) {
          zip.readEntry();
          return;
        }
        if (++budget.entries > MAX_ZIP_ENTRIES) throw new ContentError("L’archive contient trop de fichiers.");
        budget.bytes -= entry.uncompressedSize;
        if (budget.bytes < 0) throw new ContentError("L’archive décompressée est trop volumineuse.");
        const stream = await entryStream(zip, entry);
        const extension = extensionOf(relative);
        if (extension === ".zip" && allowNested) {
          // Les exports Notion volumineux sont découpés en ZIP imbriqués
          const nested = join(workDir, `${randomUUID()}.zip`);
          await pipeline(stream, createWriteStream(nested));
          await extractZip(nested, prefix, budget, workDir, false);
          await rm(nested, { force: true });
        } else if ((extension === ".html" || extension === ".htm") && entry.uncompressedSize < 5_000_000) {
          const buffer = await readStream(stream);
          await putObject(prefix + relative, buffer, mimeOf(relative));
          budget.paths.push(relative);
          if (budget.textSize < SEARCH_LIMIT) {
            const text = htmlToText(buffer.toString("utf-8"));
            budget.text.push(text);
            budget.textSize += text.length;
          }
        } else {
          await putObject(prefix + relative, stream, mimeOf(relative), entry.uncompressedSize);
          budget.paths.push(relative);
        }
        zip.readEntry();
      } catch (error) {
        zip.close();
        reject(error instanceof ContentError ? error : new ContentError(`Impossible d’extraire ${entry.fileName.slice(0, 100)}.`));
      }
    });
    zip.readEntry();
  });
}

/** Importe une archive déjà stockée dans le bucket. Le contenu ne devient visible qu'une fois complet. */
export async function ingestZipObject(docId: string, objectKey: string) {
  const workDir = await mkdtemp(join(env.tmpDir || tmpdir(), "zip-"));
  const version = randomUUID();
  const prefix = versionPrefix(docId, version);
  try {
    const object = await getObject(objectKey);
    if (!object?.Body) throw new ContentError("Archive introuvable.");
    const zipPath = join(workDir, "source.zip");
    await pipeline(object.Body as Readable, createWriteStream(zipPath));
    if ((await stat(zipPath)).size === 0) throw new ContentError("Cette archive est vide.");
    const budget: Budget = { bytes: MAX_ZIP_EXTRACTED_BYTES, entries: 0, paths: [], text: [], textSize: 0 };
    await extractZip(zipPath, prefix, budget, workDir, true);
    await activateVersion(docId, version, "site", chooseEntry(budget.paths), budget.text.join(" "));
  } catch (error) {
    await deletePrefix(prefix).catch(() => undefined);
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
