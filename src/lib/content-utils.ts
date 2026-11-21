// Fonctions pures, sans dépendance serveur : testées unitairement contre les attaques.

export const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json",
  ".map": "application/json", ".txt": "text/plain; charset=utf-8", ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon", ".pdf": "application/pdf",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf", ".mp4": "video/mp4",
  ".webm": "video/webm", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".wasm": "application/wasm",
};

export const extensionOf = (name: string) => {
  const base = name.slice(name.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot).toLowerCase() : "";
};

export const mimeOf = (name: string) => MIME_TYPES[extensionOf(name)] ?? "application/octet-stream";

/** Sans accents ni majuscules : « Équation » et « equation » se retrouvent. */
export const folded = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

export const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

export class ContentError extends Error {}

export type TextKind = "html" | "artifact" | "markdown";

export function detectKind(text: string, filename = ""): TextKind {
  const extension = extensionOf(filename);
  if (extension === ".html" || extension === ".htm") return "html";
  if (extension === ".jsx" || extension === ".tsx") return "artifact";
  if (extension === ".md" || extension === ".markdown") return "markdown";
  const start = text.trimStart().slice(0, 200).toLowerCase();
  if (/^<[a-z!]/.test(start)) return "html";
  if (/^\s*export\s+default\b/m.test(text) || /^\s*import\s.+from\s+['"]react['"]/m.test(text)) return "artifact";
  if (!start.startsWith("<")) return "markdown";
  throw new ContentError("Format non reconnu : utilise du HTML, un artefact JSX/TSX ou du Markdown.");
}

/** Normalise un chemin d'archive ou d'URL. Renvoie null s'il tente de sortir du document. */
export function safeRelativePath(raw: string): string | null {
  if (raw.length > 900 || raw.includes("\0")) return null;
  const unified = raw.replace(/\\/g, "/");
  if (unified.startsWith("/") || /^[a-zA-Z]:/.test(unified)) return null;
  const parts = unified.split("/").filter((p) => p !== "" && p !== ".");
  if (!parts.length || parts.includes("..")) return null;
  if (parts.some((p) => /[\x00-\x1f\x7f]/.test(p))) return null;
  return parts.join("/");
}

export const isJunkZipEntry = (path: string) =>
  path.startsWith("__MACOSX/") || /(^|\/)(\.DS_Store|Thumbs\.db)$/.test(path);

export function chooseEntry(paths: string[]): string {
  const pages = paths.filter((p) => [".html", ".htm"].includes(extensionOf(p)));
  if (!pages.length) throw new ContentError("Cette archive ne contient aucune page HTML : ajoute-la plutôt en pièce jointe.");
  const indexes = pages.filter((p) => /(^|\/)index\.html?$/i.test(p));
  const depth = (p: string) => p.split("/").length;
  return [...(indexes.length ? indexes : pages)].sort((a, b) => depth(a) - depth(b) || a.localeCompare(b))[0];
}

/** Signature réelle du fichier : l'extension et le type annoncés ne sont jamais crus. */
export function sniffInline(head: Uint8Array): string | null {
  const ascii = Buffer.from(head.subarray(0, 12)).toString("latin1");
  if (ascii.startsWith("%PDF-")) return "application/pdf";
  if (ascii.startsWith("\x89PNG\r\n\x1a\n")) return "image/png";
  if (ascii.startsWith("\xff\xd8\xff")) return "image/jpeg";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
  if (ascii.startsWith("GIF8")) return "image/gif";
  if (ascii.slice(4, 8) === "ftyp") return ascii.slice(8, 11) === "M4A" ? "audio/mp4" : "video/mp4";
  if (ascii.startsWith("\x1aE\xdf\xa3")) return "video/webm";
  if (ascii.startsWith("OggS")) return "audio/ogg";
  if (ascii.startsWith("ID3") || (ascii.charCodeAt(0) === 0xff && (ascii.charCodeAt(1) & 0xe0) === 0xe0)) return "audio/mpeg";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WAVE") return "audio/wav";
  return null;
}

/** Pièce jointe HTML : extension .html/.htm, 5 Mo au plus, du texte (aucun octet nul au début). */
export const MAX_HTML_ATTACHMENT = 5 * 1024 * 1024;
export function isHtmlAttachment(filename: string, head: Uint8Array, size: number) {
  return [".html", ".htm"].includes(extensionOf(filename)) && size > 0 && size <= MAX_HTML_ATTACHMENT && !head.includes(0);
}

export function cleanFilename(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = base.replace(/[\x00-\x1f\x7f<>:"|?*]/g, "").replace(/^[ .]+|[ .]+$/g, "");
  return cleaned.slice(0, 255) || "fichier";
}

export function contentDisposition(type: "inline" | "attachment", filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\%;]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Extrait du texte pour la recherche. Résultat jamais réaffiché en HTML. */
export function htmlToText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<[^>]{0,2000}>/g, " ")
    .replace(/&[a-z#0-9]{1,8};/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseNotionId(value: string): string | null {
  const path = value.trim().split(/[?#]/)[0].replace(/\/$/, "");
  const match = /([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(path);
  return match ? match[1].replace(/-/g, "").toLowerCase() : null;
}

const CONTROL_AND_SPACE = /[\x00-\x20\x7f]+/g;

export function isDangerousUrl(value: string) {
  return /^(javascript|vbscript|data|file|blob):/i.test(value.replace(CONTROL_AND_SPACE, ""));
}

export const isHttpUrl = (value: string) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const NOTION_FILE_HOSTS = [/^prod-files-secure\.s3\.[a-z0-9-]+\.amazonaws\.com$/, /^s3[.-][a-z0-9-]+\.amazonaws\.com$/,
  /^file\.notion\.so$/, /^(www\.)?notion\.so$/, /^[a-z0-9-]+\.notion-static\.com$/, /^[a-z0-9-]+\.notionusercontent\.com$/];

/** Anti-SSRF : le serveur ne télécharge que depuis les hôtes de fichiers Notion, en HTTPS. */
export function isNotionFileUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (url.port === "" || url.port === "443")
      && NOTION_FILE_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

/**
 * react-notion-x remet les images à son proxy app.notion.com avant d'appeler notre fonction : on retrouve
 * l'adresse d'origine pour que le navigateur des lecteurs ne contacte jamais Notion.
 */
export function unwrapNotionImage(resolved: string | undefined): string {
  if (!resolved) return "";
  try {
    const url = new URL(resolved, "https://local.invalid");
    const match = /^\/image\/([^/]+)/.exec(url.pathname);
    if (url.hostname.endsWith("notion.com") && match) return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
  return resolved;
}

/** Seuls les fichiers copiés à la synchronisation s'affichent : ni la politique du site ni la vie privée n'admettent le reste. */
export const isCopiedNotionImage = (src: string | undefined) => typeof src === "string" && (src.startsWith("/notion-asset/") || src.startsWith("data:image/"));

const SIGNED = /X-Amz-Signature=|\/secure\.notion-static\.com\/|prod-files-secure\./;
export const isExpiringNotionUrl = (value: string) => isNotionFileUrl(value) && SIGNED.test(value);

/** Parcourt un recordMap Notion en remplaçant ses chaînes, sans recopier de clé pouvant polluer un prototype. */
export function walkStrings(value: unknown, transform: (text: string, isLink: boolean) => string, isLink = false): unknown {
  if (typeof value === "string") return transform(value, isLink);
  if (Array.isArray(value)) {
    // Décoration de lien Notion : ["a", "https://…"]
    const decoration = value.length === 2 && value[0] === "a";
    return value.map((item, index) => walkStrings(item, transform, isLink || (decoration && index === 1)));
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = Object.create(null);
    for (const [key, item] of Object.entries(value)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      output[key] = walkStrings(item, transform, isLink || URL_KEYS.has(key));
    }
    return output;
  }
  return value;
}

const URL_KEYS = new Set(["source", "link", "display_source", "page_cover", "page_icon", "url", "href", "src", "bookmark_icon", "bookmark_cover"]);

/** Titres très proches : au moins 70 % de mots significatifs en commun. */
export function similarTitles(a: string, b: string) {
  const words = (text: string) => new Set(folded(text).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !["les", "des", "une", "pour", "dans", "chapitre", "cours"].includes(w)));
  const left = words(a);
  const right = words(b);
  if (!left.size || !right.size) return folded(a).trim() === folded(b).trim();
  const common = [...left].filter((w) => right.has(w)).length;
  return common / Math.max(left.size, right.size) >= 0.7;
}
