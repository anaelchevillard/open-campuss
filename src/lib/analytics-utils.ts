// Fonctions pures. Aucun jeton, aucune recherche et aucun paramètre ne doivent entrer dans les statistiques.

const TOKEN_PATHS = /^\/(reset|verify|p)\/[^/]+$/;
const KNOWN = /^\/(login(\/2fa)?|register|forgot|account|accepter-cgu|bienvenue|reviser|calendrier|favoris|actualites(\/[0-9a-f-]{36})?|presentation|moderation|enseignant|contribuer|classement|cgu|confidentialite|credits|contact|admin(\/[a-z-]+)*|matieres\/\d{1,9}|d\/[0-9a-f-]{36}(\/notion\/[0-9a-f]{32})?|u\/[0-9a-f-]{36}|editer\/[0-9a-f-]{36}|admin\/users\/[0-9a-f-]{36}|admin\/documents\/[0-9a-f-]{36})?$/;

export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 400 || !raw.startsWith("/")) return null;
  const path = raw.split(/[?#]/)[0].replace(/(.)\/$/, "$1");
  if (TOKEN_PATHS.test(path)) return path.replace(/\/[^/]+$/, "/:jeton");
  return KNOWN.test(path) ? path : "/autre";
}

export function deviceOf(userAgent: string) {
  if (/ipad|tablet/i.test(userAgent)) return "Tablette";
  return /mobi|android|iphone/i.test(userAgent) ? "Téléphone" : "Ordinateur";
}

export function browserOf(userAgent: string) {
  if (/edg\//i.test(userAgent)) return "Edge";
  if (/firefox\//i.test(userAgent)) return "Firefox";
  if (/chrome\//i.test(userAgent)) return "Chrome";
  if (/safari\//i.test(userAgent)) return "Safari";
  return "Autre";
}

export const isBot = (userAgent: string) => !userAgent || /bot|crawl|spider|slurp|headless|curl|wget|python|preview/i.test(userAgent);

export function referrerHost(raw: unknown, ownHost: string) {
  if (typeof raw !== "string" || !raw) return "";
  try {
    const host = new URL(raw).hostname.toLowerCase().slice(0, 120);
    return host === ownHost ? "" : host;
  } catch {
    return "";
  }
}

/** Famille du système, sans version : seulement pour regrouper les erreurs. */
export function osOf(userAgent: string) {
  if (/iphone|ipad|ipod/i.test(userAgent)) return "iOS";
  if (/android/i.test(userAgent)) return "Android";
  if (/windows/i.test(userAgent)) return "Windows";
  if (/mac os|macintosh/i.test(userAgent)) return "macOS";
  if (/cros/i.test(userAgent)) return "ChromeOS";
  if (/linux/i.test(userAgent)) return "Linux";
  return "Autre";
}
