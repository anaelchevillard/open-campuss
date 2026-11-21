/**
 * La politique est celle du document chargé : une navigation interne (next/link) garde celle de la page d'arrivée.
 * Ouvrir img-src pour une seule route ne marcherait donc qu'au rechargement : aucune exception par page ici, sauf le
 * WebAssembly de la présentation (WASM_PATHS), dont l'absence ne casse rien.
 */
/** Captcha Cloudflare Turnstile : ouvert seulement quand ses deux clés sont posées (inscription). */
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/**
 * Seule page qui compile du WebAssembly : la présentation (« / »), pour le décodeur meshopt du téléphone 3D (auto-hébergé, dans
 * le paquet JS de la page). 'wasm-unsafe-eval' n'autorise que la compilation de WebAssembly, pas eval() ni new Function().
 * Arrivé là par une navigation interne, on garde la politique de la page de départ : le téléphone dessiné reste alors affiché.
 */
export const WASM_PATHS: readonly string[] = ["/"];

export function contentSecurityPolicy({ nonce, dev, baseUrl, contentOrigin, turnstile = false, wasm = false }: { nonce: string; dev: boolean; baseUrl: string; contentOrigin?: string; turnstile?: boolean; wasm?: boolean }) {
  const challenge = turnstile ? ` ${TURNSTILE_ORIGIN}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${challenge}${wasm ? " 'wasm-unsafe-eval'" : ""}${dev ? " 'unsafe-eval'" : ""}`,
    // Base UI, KaTeX, BlockNote et react-notion-x posent des attributs style ; aucun script n'en dépend.
    // Les balises restent ouvertes tant que le nonce n'est pas transmis aux bibliothèques qui en insèrent (voir le README).
    "style-src 'self' 'unsafe-inline'",
    "style-src-elem 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    // Miniatures des vidéos YouTube de Notion : un seul hôte, dont le chemin n'est pas choisi par un tiers
    "img-src 'self' data: https://i.ytimg.com",
    "font-src 'self' data:",
    "media-src 'self'",
    `frame-src 'self'${contentOrigin ? ` ${contentOrigin}` : ""} https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://www.loom.com https://docs.google.com https://drive.google.com https://www.figma.com https://embed.figma.com${challenge}`,
    `connect-src 'self' wss://${new URL(baseUrl).host}${challenge}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}

/** includeSubDomains engage tout le domaine : jamais sur un hôte qui n'est ni le site ni ses artefacts (préproduction, ancienne adresse). */
export function strictTransportSecurity(host: string, baseUrl: string, contentOrigin?: string) {
  const base = new URL(baseUrl);
  if (base.protocol !== "https:") return null;
  const known = [base.host, ...(contentOrigin ? [new URL(contentOrigin).host] : [])];
  return known.includes(host) ? "max-age=31536000; includeSubDomains; preload" : null;
}
