/** Règles pures du « voir comme » (testées sans base). */

export const VIEW_COOKIE = "__Host-campus-view";
export const VIEW_MINUTES = 15;
export const VIEW_MAX_PER_DAY = 5;
export const VIEW_MAX_PATHS = 200;
/** Seule requête non GET permise pendant un aperçu : y mettre fin. */
export const VIEW_END_PATH = "/api/admin/apercu/fin";
export const VIEW_HIDDEN_PATH = "/apercu-masque";

/** Ce qui reste privé même pour un administrateur : annotations, révision, amis, jeu, comptes connectés, réglages. */
const EXCLUDED = [
  /^\/reviser(\/|$)/, /^\/amis(\/|$)/, /^\/groupes(\/|$)/, /^\/parametres(\/|$)/, /^\/notifications(\/|$)/, /^\/moi(\/|$)/,
  /^\/api\/account(\/|$)/, /^\/api\/connected(\/|$)/, /^\/api\/passkey(\/|$)/, /^\/api\/notifications(\/|$)/, /^\/api\/annotations?(\/|$)/, /^\/api\/notes(\/|$)/, /^\/revision-files(\/|$)/, /^\/card-images(\/|$)/, /^\/api\/cards(\/|$)/,
  /^\/d\/[^/]+\/(quiz|fiches|notes|reviser)(\/|$)/, /^\/admin(\/|$)/, /^\/moderation(\/|$)/, /^\/contribuer\/nouveau/, /^\/editer(\/|$)/,
];

export const isHiddenInPreview = (path: string) => EXCLUDED.some((re) => re.test(path));

export type ViewRefusalInput = {
  adminId: string; targetId: string; targetRole: string; targetIsOwner: boolean; targetStatus: string;
  startedToday: number; reason: string;
};

export function viewRefusal(input: ViewRefusalInput): string | null {
  if (input.adminId === input.targetId) return "Impossible sur ton propre compte.";
  if (input.targetIsOwner || input.targetRole === "admin") return "Impossible de voir le site comme un administrateur.";
  if (input.targetStatus !== "active") return "Ce compte n’est pas actif.";
  if (input.startedToday >= VIEW_MAX_PER_DAY) return `${VIEW_MAX_PER_DAY} aperçus par jour au plus : réessaie demain.`;
  return null;
}

/** Chemins visités : sans paramètres (qui peuvent porter des recherches), dédoublonnés à la suite, plafonnés. */
export function appendPath(paths: string[], path: string) {
  const clean = path.split(/[?#]/)[0].slice(0, 200);
  if (!clean.startsWith("/") || paths.at(-1) === clean || paths.length >= VIEW_MAX_PATHS) return paths;
  return [...paths, clean];
}
