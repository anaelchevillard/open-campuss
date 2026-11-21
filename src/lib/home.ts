/**
 * « / » est la présentation, pour tout le monde ; l'accueil connecté (la séance du jour, les cours,
 * les matières) vit à /accueil, l'adresse qui porte le nom de l'onglet. Module sans dépendance (proxy, service worker).
 */
export const HOME = "/accueil";

/**
 * Un ancien lien vers l'accueil (« / », « /?semestre=… », « /#… ») mène à la même chose sous /accueil : les
 * notifications déjà enregistrées, les `next=` des liens de connexion et les favoris gardent leur sens.
 */
export function homeOf(path: string): string {
  if (path === "/" || path.startsWith("/?") || path.startsWith("/#")) return `${HOME}${path.slice(1)}`;
  return path;
}

/**
 * Destination après une connexion ou une notification. Pas de redirection ouverte : chemin local uniquement, sans « // »
 * ni « /\\ » ni caractère de contrôle. « / » est la présentation : l'ancien accueil mène à /accueil.
 */
export function safeNext(value: unknown): string {
  const next = typeof value === "string" ? value : HOME;
  return /^\/(?![/\\])[^\x00-\x1f\\]*$/.test(next) ? homeOf(next) : HOME;
}
