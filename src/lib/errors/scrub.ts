// Nettoyage des erreurs avant toute écriture. Pur : utilisé par le navigateur (avant l'envoi) et
// par le serveur (qui refait tout, le navigateur n'étant jamais cru). Rien de ce qui suit ne doit sortir d'ici :
// adresse mail, jeton, mot de passe, cookie, en-tête d'autorisation, paramètre d'URL, IP, numéro long, valeur SQL.

export const LIMITS = { name: 80, message: 500, stack: 4000, frames: 25, route: 200 } as const;

const SENSITIVE_KEYS = "pass(?:word|wd)?|mot_?de_?passe|token|jeton|secret|api[_-]?key|key|code|otp|totp|session|sid|auth(?:orization)?|cookie|e?mail|signature|sig|state|nonce|csrf|credential|ref|next|q|query";

const RULES: [RegExp, string][] = [
  // Valeurs d'une requête SQL dans un message de drizzle ou de pg
  [/\bparams:\s*[\s\S]*$/i, "params: [masqué]"],
  [/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{6,}/gi, "$1 [masqué]"],
  [/\b(cookie|set-cookie|authorization|x-api-key)\s*[:=]\s*[^\n]*/gi, "$1: [masqué]"],
  [new RegExp(`(["']?\\b(?:${SENSITIVE_KEYS})["']?\\s*[=:]\\s*)("[^"]*"|'[^']*'|[^\\s&,;)}\\]]+)`, "gi"), "$1[masqué]"],
  // Adresse mail, même encodée dans une URL
  [/[A-Za-z0-9._%+-]+(?:@|%40)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[adresse]"],
  // Partie requête et fragment d'une URL
  // (sans lookbehind : un vieux Safari refuserait tout le module)
  [/(\b(?:https?|wss?):\/\/[^\s?#"'<>]*|(?:^|[\s(])\/[\w\-./[\]]*)[?#][^\s"'<>)]*/g, "$1"],
  // JWT, jetons longs (base64url ou hex), UUID
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]+)?/g, "[jeton]"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]"],
  [/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g, "[jeton]"],
  // Adresses IP
  [/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "[ip]"],
  [/\b(?:[0-9a-f]{1,4}:){4,7}[0-9a-f]{1,4}\b/gi, "[ip]"],
  // Numéros longs (téléphone, carte, numéro étudiant)
  [/\+?\d[\d .-]{7,}\d/g, "[n]"],
];

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Retire tout ce qui pourrait désigner une personne ou ouvrir un accès. */
export function scrubText(raw: unknown, max: number = LIMITS.message) {
  if (raw === null || raw === undefined) return "";
  let text = String(raw).slice(0, max * 4).replace(CONTROL, "");
  for (const [pattern, replacement] of RULES) text = text.replace(pattern, replacement);
  return text.trim().slice(0, max);
}

/**
 * Pile nettoyée : lignes de pile seulement (« at … » ou « fonction@fichier »), chemins ramenés à la racine du projet
 * (ni dossier du serveur, ni hôte, ni paramètre), 25 lignes au plus. Les lignes d'extensions du navigateur partent.
 */
export function scrubStack(raw: unknown) {
  if (typeof raw !== "string" || !raw) return "";
  // Chrome : « at f (fichier:1:2) » ; Firefox et Safari : « f@fichier:1:2 »
  const lines = raw.slice(0, 20_000).split("\n").map((l) => l.trim()).filter((l) => /^at\s|^[\w$.<>[\]/ ]*@\S*:\d+/.test(l));
  const kept = lines
    .filter((l) => !/(chrome|moz|safari(?:-web)?)-extension:\/\//.test(l))
    .slice(0, LIMITS.frames)
    .map((l) => scrubText(l.replace(/[?#][^\s:)]*/g, "").replace(/(?:file:\/\/)?\/(?:app|srv|home|root|usr|opt|tmp|var)\/[^\s():]*?(?=(?:\.next|src|node_modules|_next)\/)/g, "/")
      .replace(/\bhttps?:\/\/[^/\s)]+/g, ""), 300));
  return kept.join("\n").slice(0, LIMITS.stack);
}

/** Nom d'erreur lisible et borné : TypeError, ChunkLoadError… ; « Error » à défaut. */
export function errorName(raw: unknown) {
  const name = typeof raw === "string" ? raw.replace(/[^\w$.]/g, "").slice(0, LIMITS.name) : "";
  return name || "Error";
}

/**
 * Route d'une adresse : chemin seul, identifiants remplacés (UUID, nombres, jetons), 6 segments au plus. Ne garde
 * jamais la partie requête ni le fragment.
 */
export function routeOf(raw: unknown) {
  if (typeof raw !== "string" || !raw.startsWith("/")) return "";
  const path = raw.split(/[?#]/)[0];
  if (/^\/(reset|verify|p|invitation|desabonnement|email)\//.test(path)) return `${path.split("/").slice(0, 2).join("/")}/[jeton]`;
  return `/${path.split("/").filter(Boolean).slice(0, 6).map((segment) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(segment) ? "[id]"
      : /^\d+$/.test(segment) ? "[n]"
        : segment.length > 40 || /[^\w\-.[\]]/.test(segment) || /\d{4,}/.test(segment) ? "[x]" : segment,
  ).join("/")}`.slice(0, LIMITS.route);
}

/**
 * Message normalisé pour l'empreinte : les parties qui changent d'une occurrence à l'autre (nombres, identifiants,
 * textes entre guillemets) ne séparent pas deux occurrences de la même erreur.
 */
export function normalizeMessage(message: string) {
  return message
    .replace(/(["'`«])(?:(?!\1).){0,200}(\1|»)/g, "<s>")
    .replace(/\[(?:id|jeton|adresse|ip|n|masqué)\]/g, "<v>")
    .replace(/\b0x[0-9a-f]+\b/gi, "<n>")
    .replace(/\d+(?:\.\d+)?/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/**
 * Lignes de pile normalisées pour l'empreinte : fichier sans dossier, sans empreinte de build (chunks de Next) ni
 * numéro de ligne, et seulement les 3 premières lignes du code du site (pas celles de React ou de Next).
 */
export function normalizeFrames(stack: string) {
  return stack.split("\n")
    .map((line) => /([\w\-.[\]]+?)(?:[-.][0-9a-f]{6,})?\.(?:m?js|tsx?|jsx)\b/i.exec(line)?.[1]?.replace(/\d+/g, "<n>") ?? "")
    .filter((file, i, all) => file && !/^(react|next|webpack|node|internal|runtime)/i.test(file) && all.indexOf(file) === i)
    .slice(0, 3);
}

/** Texte dont l'empreinte (sha-256) identifie le groupe : source, type, message normalisé, premières lignes. */
export function fingerprintInput(source: "server" | "client", name: string, message: string, stack: string) {
  return [source, name, normalizeMessage(message), ...normalizeFrames(stack)].join("|");
}

/** Bruit du navigateur sans intérêt : erreur d'un script d'une autre origine, boucle de ResizeObserver, extensions. */
export function isNoise(message: string, stack: string) {
  // Contrôle de flux de Next (redirection d'une action serveur, 404) remonté dans le navigateur : pas une panne
  return /^Script error\.?$/i.test(message.trim())
    || /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK)\b/.test(message.trim())
    || /ResizeObserver loop/i.test(message)
    || /(chrome|moz|safari(?:-web)?)-extension:\/\//.test(stack)
    || (!message && !stack);
}
