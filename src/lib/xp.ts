/**
 * XP de révision : privée, plafonnée, sans hasard. Les crédits restent la monnaie publique de la contribution.
 * Barème en code, annoncé tel quel dans la feuille « Crédits et XP ».
 */
export const XP = {
  cardGood: 2,
  cardHard: 1,
  cardFailed: 1,
  question: 3,
  session: 10,
  goal: 15,
} as const;

export const XP_DAILY_CAP = 300;
/** Une fiche notée plus vite que ça n'a pas été lue : elle ne rapporte rien. */
export const MIN_CARD_MS = 1500;

/** On récompense l'effort, pas la chance : une fiche ratée rapporte autant qu'une difficile. */
export function cardXp(grade: number, ms: number) {
  if (!Number.isFinite(ms) || ms < MIN_CARD_MS) return 0;
  if (grade >= 2) return XP.cardGood;
  return grade === 1 ? XP.cardHard : XP.cardFailed;
}

/** Ce qui reste à gagner aujourd'hui : jamais plus que le plafond. */
export function grantXp(earnedToday: number, gain: number) {
  return Math.max(0, Math.min(Math.round(gain), XP_DAILY_CAP - Math.max(0, earnedToday)));
}

/**
 * Un quiz déjà réussi à 100 % dans la journée ne rapporte plus rien ; sinon 3 XP par bonne réponse.
 */
export function quizXp(score: number, perfectToday: boolean) {
  return perfectToday ? 0 : Math.max(0, score) * XP.question;
}

/** Niveau n : il faut 50 × n × (n + 1) XP au total. 100 pour le niveau 2, 300 pour le 3, 600 pour le 4… */
export const xpForLevel = (level: number) => 50 * (level - 1) * level;

export function levelOfXp(total: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= total) level++;
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  return { level, into: total - from, span: to - from, next: to };
}

/** Paliers de la semaine : jours où les trois quêtes sont faites. Annoncés d'avance, jamais tirés au sort. */
export const WEEKLY_TIERS = [
  { days: 3, xp: 20 },
  { days: 5, xp: 30 },
  { days: 7, xp: 50 },
] as const;

/** Le bonus d'un palier franchi au moment où l'on boucle une journée de quêtes, sinon 0. */
export function tierBonus(fullDaysBefore: number, fullDaysAfter: number) {
  return WEEKLY_TIERS.filter((tier) => fullDaysBefore < tier.days && fullDaysAfter >= tier.days).reduce((sum, tier) => sum + tier.xp, 0);
}
