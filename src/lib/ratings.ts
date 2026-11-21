// Fonctions pures : le classement doit rester testable sans base.

/** En dessous, une moyenne dit plus sur deux personnes que sur le cours. */
export const MIN_RATINGS_SHOWN = 3;

const PRIOR_MEAN = 3.5;
const PRIOR_WEIGHT = 5;

export type RatingStats = { ratingAvg: number | null; ratingCount: number };

export const formatAverage = (average: number) => average.toFixed(1).replace(".", ",");

/** « 4,5 (12) », ou rien tant qu'il y a trop peu de notes. */
export function ratingLabel(average: number | null, count: number) {
  return average !== null && count >= MIN_RATINGS_SHOWN ? `${formatAverage(average)} (${count})` : null;
}

/** Moyenne bayésienne : chaque cours part de cinq notes fictives à 3,5, et les vraies notes l'en éloignent peu à peu. */
export function bayesianScore(average: number, count: number) {
  return (PRIOR_WEIGHT * PRIOR_MEAN + count * average) / (PRIOR_WEIGHT + count);
}

/** Un cours sans note passe après les autres : personne n'a dit qu'il était bon. */
export function compareByRating(a: RatingStats, b: RatingStats) {
  if (a.ratingAvg === null || b.ratingAvg === null) return Number(a.ratingAvg === null) - Number(b.ratingAvg === null);
  return bayesianScore(b.ratingAvg, b.ratingCount) - bayesianScore(a.ratingAvg, a.ratingCount) || b.ratingCount - a.ratingCount;
}
