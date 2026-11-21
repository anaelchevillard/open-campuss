// Limites et échantillonnage des erreurs. Purs, en mémoire : un compteur approximatif suffit,
// l'enjeu est de ne jamais laisser une boucle d'erreurs remplir la base ou saturer le serveur.

export type Window = Map<string, number[]>;

/**
 * Prend une place dans une fenêtre glissante : `limit` passages par `windowMs` et par clé. La table est vidée si elle
 * grossit trop (beaucoup de clés différentes) : on préfère oublier que garder la mémoire d'une attaque.
 */
export function takeSlot(window: Window, key: string, limit: number, windowMs: number, now = Date.now(), maxKeys = 5000) {
  const recent = (window.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    window.set(key, recent);
    return false;
  }
  if (window.size >= maxKeys && !window.has(key)) window.clear();
  window.set(key, [...recent, now]);
  return true;
}

/** Envoi d'erreurs du navigateur : par adresse, puis pour tout le site. */
export const CLIENT_LIMITS = { perIpPerMinute: 10, sitePerMinute: 300, maxBodyBytes: 16_384 } as const;
/** Erreurs du serveur : au plus 300 écrites par minute, le reste n'est que journalisé. */
export const SERVER_PER_MINUTE = 300;
/** Exemples gardés par groupe et par jour ; au-delà, seul le compteur du groupe avance. */
export const SAMPLES_PER_DAY = 100;
/** Seuil de pic : occurrences d'une même erreur dans l'heure. */
export const SPIKE_PER_HOUR = 50;

/** Garder l'exemple ? Toujours sous le plafond du jour, jamais au-dessus : le compteur, lui, reste exact. */
export const keepSample = (storedToday: number) => storedToday < SAMPLES_PER_DAY;

/**
 * Côté navigateur : une même erreur n'est envoyée qu'une fois par page, 5 erreurs au plus par page, et chaque envoi
 * est tiré au sort selon `rate` (1 = tout envoyer). `seen` garde les clés déjà vues sur cette page.
 */
export const PAGE_MAX = 5;
export function shouldSend(seen: Set<string>, key: string, rate: number, random: number) {
  if (seen.has(key) || seen.size >= PAGE_MAX) return false;
  seen.add(key);
  return random < rate;
}

/** L'erreur revient-elle ? Une erreur résolue se rouvre seulement si elle revient dans une autre version. */
export function reopens(status: "open" | "resolved" | "ignored", resolvedIn: string | null, release: string) {
  return status === "resolved" && (resolvedIn ?? "") !== release;
}
