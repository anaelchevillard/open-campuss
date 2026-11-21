/**
 * Règles de la contribution (pur, testé) : propositions de modification ouvertes à tout lecteur.
 * Une correction acceptée rapporte moins qu'une création : un cours publié vaut POINTS.cours (30) dans gamification.ts.
 */
export const POINTS_PER_CORRECTION = 10;

/** Limites de débit des propositions : par heure, par jour, et en attente sur un même cours. */
export const PROPOSALS_PER_HOUR = 3;
export const PROPOSALS_PER_DAY = 10;
export const PENDING_PROPOSALS_PER_DOC = 2;

/** Points d'une suite de corrections acceptées, comptées sur les cours des autres seulement. */
export const correctionPoints = (accepted: number) => Math.max(0, accepted) * POINTS_PER_CORRECTION;
