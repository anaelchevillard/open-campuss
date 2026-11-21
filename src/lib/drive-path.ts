/**
 * Où range-t-on une copie pour le Drive. Le titre et les noms de fichier viennent des étudiants : tout segment
 * passe par ici avant de devenir une clé S3, puis un chemin sur un Drive éventuellement synchronisé sous Windows.
 */
export const DRIVE_PREFIX = "drive/";
const MAX_SEGMENT_BYTES = 120;
const FORBIDDEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}<>:"/\\|?*]/gu;
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

function truncateBytes(value: string, max: number) {
  let bytes = 0;
  let out = "";
  for (const char of value) {
    bytes += Buffer.byteLength(char);
    if (bytes > max) break;
    out += char;
  }
  return out;
}

const trimEdges = (value: string) => value.replace(/^[\s.]+|[\s.]+$/g, "");

export function safeSegment(raw: string, fallback: string) {
  let name = trimEdges(raw.normalize("NFC").replace(FORBIDDEN, " ").replace(/\.{2,}/g, ".").replace(/(^|\s)\.(?=\s|$)/g, " ").replace(/\s+/g, " "));
  const extension = name.match(/\.[\p{L}\p{N}]{1,10}$/u)?.[0] ?? "";
  if (Buffer.byteLength(name) > MAX_SEGMENT_BYTES) {
    const stem = name.slice(0, name.length - extension.length);
    name = trimEdges(truncateBytes(stem, MAX_SEGMENT_BYTES - Buffer.byteLength(extension))) + extension;
  }
  if (!name) return fallback;
  return RESERVED.test(name) ? `_${name}` : name;
}

export type DrivePlace = { program: string; level: number | null; subject: string | null; title: string };

// Un titre finissant par .md se confondrait avec le fichier d'un autre cours, et MinIO refuse qu'un objet soit aussi un dossier
export function driveBase({ program, level, subject, title }: DrivePlace) {
  const year = level !== null && Number.isInteger(level) && level > 0 ? `L${level}` : "Sans année";
  return `${DRIVE_PREFIX}${safeSegment(program, "Sans licence")}/${year}/${safeSegment(subject ?? "", "Sans matière")}/${safeSegment(title.replace(/(\.md\s*)+$/i, ""), "Sans titre")}`;
}

// Drive accepte les doublons, et un dossier synchronisé sous Windows ou macOS confond les casses
const folded = (path: string) => path.normalize("NFC").toLocaleLowerCase("fr");

/** Deux cours du même nom ne s'écrasent pas : le suivant prend un suffixe stable, tiré de son identifiant. */
export function uniqueBase(base: string, documentId: string, taken: ReadonlySet<string>) {
  return taken.has(folded(base)) ? `${base} (${documentId.slice(0, 8)})` : base;
}
export const baseKey = folded;

const EXTENSIONS: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "application/pdf": ".pdf", "video/mp4": ".mp4", "video/webm": ".webm", "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "audio/ogg": ".ogg", "audio/wav": ".wav" };

export type DriveFile = { id: string; filename: string; inlineType: string | null };

/** Fichier id vers clé, sous un dossier au nom du cours. Une image importée s'appelle juste « image ». */
export function attachmentKeys(base: string, files: DriveFile[]) {
  const keys = new Map<string, string>();
  const seen = new Set<string>();
  for (const file of files) {
    const known = file.inlineType ? EXTENSIONS[file.inlineType] : undefined;
    const name = safeSegment(/\.[\p{L}\p{N}]{1,10}$/u.test(file.filename) || !known ? file.filename : `${file.filename}${known}`, `fichier${known ?? ""}`);
    const dot = name.search(/\.[^.]*$/);
    const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
    let candidate = name;
    for (let n = 2; seen.has(folded(candidate)); n++) candidate = `${stem} (${n})${extension}`;
    seen.add(folded(candidate));
    keys.set(file.id, `${base}/${candidate}`);
  }
  return keys;
}

const FILE_LINK = /\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\?inline=1)?/g;

export const referencedFiles = (markdown: string) => new Set([...markdown.matchAll(FILE_LINK)].map((match) => match[1]));

/** Les liens pointent vers le dossier voisin du fichier .md : la copie reste lisible hors du site. */
function localLinks(markdown: string, base: string, keys: ReadonlyMap<string, string>) {
  const folder = base.split("/").pop()!;
  return markdown.replace(FILE_LINK, (link, id: string) => {
    const key = keys.get(id);
    return key ? `${encodeURIComponent(folder)}/${encodeURIComponent(key.split("/").pop()!)}`.replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16)}`) : link;
  });
}

export type DriveDocument = DrivePlace & { description: string; academicYear: string; body: string; siteUrl: string | null };

/** Aucune personne n'y figure : ni auteur, ni lecteur, ni filigrane. */
export function driveMarkdown(doc: DriveDocument, base: string, keys: ReadonlyMap<string, string>) {
  const place = [doc.program, doc.level ? `L${doc.level}` : null, doc.subject, doc.academicYear || null].filter(Boolean).join(" · ");
  return [`# ${doc.title}`, `> ${place}`, doc.description.trim(), localLinks(doc.body, base, keys).trim(), doc.siteUrl ? `Version complète sur le site : ${doc.siteUrl}` : ""]
    .filter(Boolean).join("\n\n") + "\n";
}
