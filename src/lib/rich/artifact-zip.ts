import "server-only";
import yauzl from "yauzl";
import { chooseEntry, ContentError, isJunkZipEntry, safeRelativePath } from "@/lib/content-utils";
import { MAX_ARTIFACT_ZIP_ENTRIES, MAX_ARTIFACT_ZIP_EXTRACTED } from "./artifact";

type Entry = { path: string; entry: yauzl.Entry };

/**
 * Archive d'un artefact : les mêmes protections que l'import d'un site (lib/content.ts) — chemins
 * sûrs (pas de zip slip), pas de lien symbolique, nombre et taille décompressée bornés, tailles réelles vérifiées.
 * L'archive est gardée telle quelle et lue à la demande par /embed : rien n'est extrait sur le disque.
 */
function openBuffer(input: Buffer): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(input, { lazyEntries: true, validateEntrySizes: true, strictFileNames: false, decodeStrings: true }, (error, zip) => {
      if (error || !zip) reject(new ContentError("Cette archive ZIP est illisible."));
      else resolve(zip);
    });
  });
}

async function listEntries(zip: yauzl.ZipFile): Promise<Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: Entry[] = [];
    let total = 0;
    zip.on("error", () => reject(new ContentError("Archive corrompue.")));
    zip.on("end", () => resolve(entries));
    zip.on("entry", (entry: yauzl.Entry) => {
      const path = safeRelativePath(entry.fileName);
      const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
      if (!entry.fileName.endsWith("/") && mode !== 0o120000 && path && !isJunkZipEntry(path)) {
        total += entry.uncompressedSize;
        if (entries.length >= MAX_ARTIFACT_ZIP_ENTRIES) { zip.close(); return reject(new ContentError("L’archive contient trop de fichiers.")); }
        if (total > MAX_ARTIFACT_ZIP_EXTRACTED) { zip.close(); return reject(new ContentError("L’archive décompressée est trop volumineuse.")); }
        entries.push({ path, entry });
      }
      zip.readEntry();
    });
    zip.readEntry();
  });
}

/** Vérifie l'archive et renvoie sa page d'entrée (index.html le moins profond, sinon la première page). */
export async function inspectArtifactZip(input: Buffer) {
  const zip = await openBuffer(input);
  const entries = await listEntries(zip);
  zip.close();
  return chooseEntry(entries.map((e) => e.path));
}

/** Lit un seul fichier de l'archive, par son chemin normalisé ; null s'il n'y est pas. */
export async function readArtifactZipEntry(input: Buffer, wanted: string): Promise<Buffer | null> {
  const zip = await openBuffer(input);
  try {
    const entries = await listEntries(zip);
    const found = entries.find((e) => e.path === wanted);
    if (!found) return null;
    const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
      zip.openReadStream(found.entry, (error, s) => (error || !s ? reject(new ContentError("Archive corrompue.")) : resolve(s)));
    });
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  } finally {
    zip.close();
  }
}
