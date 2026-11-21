/**
 * Carte de chaleur « Régularité » : autant de semaines que la largeur en permet, pour remplir le panneau
 * sans creux à droite. Logique pure, testée dans tests/fiches-seance.test.ts.
 */
export const HEAT_CELL = 12;
export const HEAT_GAP = 3;
/** Taille d'affichage visée d'une case, en pixels : entre 12 et ~18 selon l'arrondi. */
export const HEAT_TARGET_PX = 15;
export const HEAT_MIN_WEEKS = 10;
/** Un an : c'est aussi ce que garde gameSnapshot (HEAT_DAYS). */
export const HEAT_MAX_WEEKS = 53;
export const HEAT_DEFAULT_WEEKS = 18;

/** Nombre de semaines (colonnes) pour une largeur disponible en pixels. */
export function heatWeeks(widthPx: number) {
  if (!Number.isFinite(widthPx) || widthPx <= 0) return HEAT_DEFAULT_WEEKS;
  const scale = HEAT_TARGET_PX / HEAT_CELL;
  const weeks = Math.floor((widthPx + HEAT_GAP * scale) / ((HEAT_CELL + HEAT_GAP) * scale));
  return Math.min(HEAT_MAX_WEEKS, Math.max(HEAT_MIN_WEEKS, weeks));
}

/** Les jours affichés (AAAA-MM-JJ), colonne par colonne, lundi en haut, jusqu'à aujourd'hui inclus. */
export function heatDays(today: string, weeks: number, shift: (day: string, by: number) => string) {
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const start = shift(today, -((weeks - 1) * 7 + weekday));
  return Array.from({ length: weeks * 7 }, (_, i) => shift(start, i)).filter((day) => day <= today);
}
