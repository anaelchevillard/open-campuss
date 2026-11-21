import { timingSafeEqual } from "node:crypto";

/** Limites strictes d'un passage : une grande arborescence ne doit coûter ni mémoire ni quota d'API. */
export const MAX_NEW_PER_PASS = 20;
export const MAX_LISTED = 200;
export const MAX_CONTAINERS = 20;
export const MAX_DEPTH = 3;
export const MAX_FILE_BYTES = 16 * 1024 * 1024;
export const MAX_BATCH = 20;
export const SCAN_EVERY_MS = 7 * 86_400_000;
export const SCAN_RETRY_AFTER_MS = 86_400_000;
export const FOLDERS_PER_TURN = 3;

export type Provider = "notion" | "google";
export const isProvider = (value: unknown): value is Provider => value === "notion" || value === "google";

export type StatePayload = { user: string; provider: Provider; nonce: string; expires: number; returnTo?: string };

export const CONNECTED_PAGE = "/parametres/comptes-connectes";
const RETURN_PREFIXES = ["/editer/", "/contribuer/", "/parametres/"];
const APP_RETURN = /^campuss:\/\/[\w\-./?=&%]{0,250}$/;

/**
 * Où revenir après l'aller-retour chez Google ou Notion : un chemin du site parmi ceux qui en ont besoin, ou l'application (future).
 * Tout le reste est refusé, pour que le lien de connexion ne serve jamais de redirection ouverte.
 */
export function safeReturnTo(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw || raw.length > 300) return null;
  if (APP_RETURN.test(raw)) return raw;
  if (!raw.startsWith("/") || /[\\\s]/.test(raw) || raw.startsWith("//")) return null;
  let url: URL;
  try {
    url = new URL(raw, "https://campuss.invalid");
  } catch {
    return null;
  }
  // %2e%2e et consorts sont résolus ici : on juge le chemin réel
  if (url.origin !== "https://campuss.invalid" || !RETURN_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return null;
  return `${url.pathname}${url.search}`;
}

/** Ajoute le résultat de la connexion à l'adresse de retour, sans écraser ce qu'elle porte déjà. */
export function returnWith(target: string, result: string, provider: Provider) {
  const [path, hash = ""] = target.split("#");
  const params = `resultat=${encodeURIComponent(result)}&service=${provider}`;
  return `${path}${path.includes("?") ? "&" : "?"}${params}${hash ? `#${hash}` : ""}`;
}

export const encodeState = (payload: StatePayload) => Buffer.from(JSON.stringify(payload)).toString("base64url");

export function decodeState(body: string): StatePayload | null {
  try {
    const value = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<StatePayload>;
    if (typeof value.user !== "string" || !isProvider(value.provider) || typeof value.nonce !== "string" || typeof value.expires !== "number") return null;
    const returnTo = value.returnTo === undefined ? undefined : safeReturnTo(value.returnTo);
    if (returnTo === null) return null;
    return { user: value.user, provider: value.provider, nonce: value.nonce, expires: value.expires, ...(returnTo ? { returnTo } : {}) };
  } catch {
    return null;
  }
}

export function safeEqualText(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type Found = { id: string; title: string; mime: string; modifiedAt: number; size?: number };

const GOOGLE_DOC = "application/vnd.google-apps.document";
const EXTENSIONS: Record<string, string> = { "application/pdf": ".pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx", "text/markdown": ".md", "text/plain": ".txt", [GOOGLE_DOC]: ".docx" };

/** Seul ce que l'import existant sait convertir est proposé. */
export const isImportable = (mime: string) => mime in EXTENSIONS;
export const isGoogleDoc = (mime: string) => mime === GOOGLE_DOC;

export function fileNameFor(title: string, mime: string) {
  const extension = EXTENSIONS[mime] ?? "";
  return title.toLowerCase().endsWith(extension) ? title : `${title}${extension}`;
}

export const titleFrom = (name: string) => (name.replace(/\.(pdf|docx|md|markdown|txt)$/i, "").trim() || "Sans titre").slice(0, 200);

/** Le plus récent d'abord, sans ce qui est déjà connu, et jamais plus que la limite : le reste viendra au passage suivant. */
export function pickNew(found: Found[], known: Set<string>, limit = MAX_NEW_PER_PASS) {
  return found.filter((item) => !known.has(item.id)).sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, limit);
}

/** « modifié il y a 2 j » : court, parce que la liste du sélecteur est dense. */
export function editedAgo(at: number | null, now = Date.now()) {
  if (!at) return "";
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return "modifié à l’instant";
  if (minutes < 60) return `modifié il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `modifié il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 31) return `modifié il y a ${days} j`;
  const months = Math.round(days / 30.4);
  if (months < 12) return `modifié il y a ${months} mois`;
  const years = Math.round(days / 365);
  return `modifié il y a ${years} an${years > 1 ? "s" : ""}`;
}

export const proposalTitle = (count: number) => (count === 1 ? "1 nouvelle note, la partager ?" : `${count} nouvelles notes, les partager ?`);
