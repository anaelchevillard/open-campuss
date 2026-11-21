/**
 * Statistiques de mémoire des fiches : logique pure, testée dans tests/fiches-seance.test.ts.
 * États FSRS : 0 nouvelle, 1 apprentissage, 2 révision, 3 réapprentissage.
 */
export const MATURE_DAYS = 21;
export const FORECAST_DAYS = 7;
export const RETENTION_DAYS = 30;

const DAY = 86_400_000;

export type CardStatus = "suspended" | "new" | "learning" | "young" | "mature";
export type CardFilter = "all" | "due" | "new" | "mature" | "suspended";

export type StatCard = { dueAt: Date; state: number; intervalDays: number; suspendedAt: Date | null; lastReviewedAt?: Date | null };

/** L'état lisible d'une fiche : de côté, nouvelle, en apprentissage, jeune (< 21 j) ou acquise. */
export function cardStatus(card: StatCard): CardStatus {
  if (card.suspendedAt) return "suspended";
  if (card.state === 0 && !card.lastReviewedAt) return "new";
  if (card.state === 1 || card.state === 3) return "learning";
  return card.intervalDays >= MATURE_DAYS ? "mature" : "young";
}

export const isDue = (card: StatCard, now: Date) => !card.suspendedAt && card.dueAt.getTime() <= now.getTime();

/** Le filtre de la liste des fiches. */
export function matchesFilter(card: StatCard, filter: CardFilter, now: Date) {
  const status = cardStatus(card);
  if (filter === "all") return true;
  if (filter === "due") return isDue(card, now) && status !== "new";
  if (filter === "suspended") return status === "suspended";
  return status === filter;
}

export type MemoryStats = {
  total: number;
  /** Fiches déjà vues dont l'échéance est passée (les nouvelles sont dans `fresh`). */
  due: number; fresh: number; learning: number; young: number; mature: number; suspended: number;
  /** Part des notes autres que « Raté » sur 30 jours, en % ; null sans note. */
  retention: number | null;
  reviews: number;
  /** Fiches qui deviendront dues chaque jour, aujourd'hui compris (retards inclus dans le jour 0). */
  forecast: number[];
};

/** Les chiffres de la page Fiches. `grades` : notes des 30 derniers jours (0 raté … 3 facile). */
export function memoryStats(cards: StatCard[], grades: number[], now: Date, days = FORECAST_DAYS): MemoryStats {
  const counts = { suspended: 0, new: 0, learning: 0, young: 0, mature: 0 };
  const forecast = Array.from({ length: days }, () => 0);
  // Fin de journée locale du serveur : suffisant pour une prévision à la journée
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  let due = 0;
  for (const card of cards) {
    const status = cardStatus(card);
    counts[status]++;
    // Les nouvelles se comptent à part (comme dans Anki) : « à revoir » et la prévision ne portent que sur les fiches déjà vues
    if (status === "suspended" || status === "new") continue;
    if (isDue(card, now)) due++;
    const offset = Math.max(0, Math.ceil((card.dueAt.getTime() - endOfToday.getTime()) / DAY));
    if (offset < days) forecast[offset]++;
  }
  const kept = grades.filter((grade) => grade > 0).length;
  return {
    total: cards.length, due, fresh: counts.new, learning: counts.learning, young: counts.young, mature: counts.mature, suspended: counts.suspended,
    retention: grades.length ? Math.round((kept / grades.length) * 100) : null, reviews: grades.length, forecast,
  };
}

/** Part des fiches acquises d'un paquet (barre de maîtrise), en %. Les fiches de côté ne comptent pas. */
export function mastery(stats: Pick<MemoryStats, "total" | "suspended" | "mature">) {
  const active = stats.total - stats.suspended;
  return active > 0 ? Math.round((stats.mature / active) * 100) : 0;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

/** « 12 à revoir · 4 nouvelles · 30 fiches » : seulement ce qui existe. */
export function deckSummary(stats: Pick<MemoryStats, "total" | "due" | "fresh">) {
  return [stats.due ? `${stats.due} à revoir` : "", stats.fresh ? plural(stats.fresh, "nouvelle") : "", plural(stats.total, "fiche")].filter(Boolean).join(" · ");
}
