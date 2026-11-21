/**
 * Les seules adresses que les moteurs peuvent indexer : la présentation (« / » ; l'accueil connecté,
 * /accueil, reste noindex) et les pages d'information publiques. Tout le
 * reste (cours, partages /p/…, contenus, pages connectées, administration) reçoit `X-Robots-Tag: noindex` (next.config.ts)
 * et `robots: noindex` (layout racine). Module sans dépendance : next.config.ts l'importe au chargement.
 */
export const INDEXABLE_PAGES = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/cgu", priority: 0.4, changeFrequency: "monthly" },
  { path: "/confidentialite", priority: 0.4, changeFrequency: "monthly" },
  { path: "/credits", priority: 0.3, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.3, changeFrequency: "yearly" },
] as const;

/** Fichiers publics qui peuvent apparaître dans les résultats d'images (l'image de partage). */
const INDEXABLE_FILES = ["og.png"];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Source next.config de la règle noindex : toute adresse sauf, exactement, les pages et fichiers ci-dessus. */
export function noindexSource(): string {
  const names = [...INDEXABLE_PAGES.map((p) => p.path.slice(1)), ...INDEXABLE_FILES].map(escape);
  return `/:path((?!(?:${names.join("|")})$).*)`;
}

/** Vrai seulement pour les pages publiques et l'image de partage : tout le reste reçoit noindex (proxy et next.config). */
export function isIndexablePath(pathname: string): boolean {
  return INDEXABLE_PAGES.some((p) => p.path === pathname) || INDEXABLE_FILES.some((f) => pathname === `/${f}`);
}
