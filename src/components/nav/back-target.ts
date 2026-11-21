/**
 * Page parente connue d'un écran : la flèche retour du téléphone porte son nom (« ‹ Paramètres ») et y mène.
 * Sans parente connue, la flèche reste muette (« Retour ») et suit l'historique.
 */
export type BackTarget = { href: string; label: string };

const SETTINGS: BackTarget = { href: "/parametres", label: "Paramètres" };

export function backTarget(pathname: string, search: { get: (key: string) => string | null }): BackTarget | null {
  if (pathname === "/parametres") return { href: "/moi", label: "Moi" };
  if (pathname.startsWith("/parametres/")) return SETTINGS;
  // Personnalisation du profil ouverte depuis les paramètres (« Profil et apparence »)
  if (/^\/u\/[^/]+$/.test(pathname) && search.get("modifier") === "1" && search.get("depuis") === "parametres") return SETTINGS;
  return null;
}
