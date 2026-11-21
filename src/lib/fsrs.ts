import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from "ts-fsrs";
import type { CardSnapshot } from "./db/schema/reviser";

/**
 * Répétition espacée FSRS (bibliothèque ts-fsrs, licence MIT), à la place de SM-2.
 * Note de Campuss : 0 raté, 1 difficile, 2 bien, 3 facile.
 */
const scheduler = fsrs(generatorParameters({ request_retention: 0.9, maximum_interval: 365, enable_fuzz: false }));

const RATINGS: Record<0 | 1 | 2 | 3, Grade> = { 0: Rating.Again, 1: Rating.Hard, 2: Rating.Good, 3: Rating.Easy };

export type StoredCard = {
  dueAt: Date; intervalDays: number; ease: number; reps: number; lastReviewedAt: Date | null;
  stability: number; difficulty: number; state: number; lapses: number; learningSteps: number;
};

const DAY = 86_400_000;

/**
 * Reprise d'un état SM-2 :
 * - jamais révisée : nouvelle ;
 * - ratée à la dernière note (reps 0 mais déjà révisée) : réapprentissage, stabilité 1 jour ;
 * - sinon révision, stabilité = intervalle SM-2 (à 90 % de rétention, l'intervalle FSRS vaut la stabilité) ;
 * - difficulté tirée de la facilité : 250 → 5, 130 → 10, 330 et plus → 1.
 */
export function fromSm2(card: Pick<StoredCard, "intervalDays" | "ease" | "reps" | "lastReviewedAt">) {
  if (!card.lastReviewedAt) return { state: State.New, stability: 0, difficulty: 0 };
  const difficulty = Math.min(10, Math.max(1, 5 + (250 - card.ease) / 20));
  if (card.reps === 0) return { state: State.Relearning, stability: 1, difficulty };
  return { state: State.Review, stability: Math.max(1, card.intervalDays), difficulty };
}

/** L'état FSRS d'une fiche ; une fiche révisée mais jamais reprise (stabilité nulle) passe par fromSm2. */
export function toFsrsCard(card: StoredCard): Card {
  const legacy = card.state === State.New && card.lastReviewedAt && card.stability === 0 ? fromSm2(card) : null;
  const state = legacy?.state ?? card.state;
  const last = card.lastReviewedAt ?? undefined;
  return {
    due: card.dueAt,
    stability: legacy?.stability ?? card.stability,
    difficulty: legacy?.difficulty ?? card.difficulty,
    elapsed_days: last ? Math.max(0, Math.floor((card.dueAt.getTime() - last.getTime()) / DAY)) : 0,
    scheduled_days: card.intervalDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: state as State,
    last_review: last,
  };
}

/** La prochaine échéance après une note : les colonnes de flashcards à écrire. */
export function nextReview(card: StoredCard, grade: 0 | 1 | 2 | 3, now = new Date()) {
  const next = scheduler.next(toFsrsCard(card), now, RATINGS[grade]).card;
  return {
    dueAt: next.due,
    intervalDays: next.scheduled_days,
    reps: next.reps,
    stability: next.stability,
    difficulty: next.difficulty,
    state: next.state as number,
    lapses: next.lapses,
    learningSteps: next.learning_steps,
    lastReviewedAt: now,
  };
}

const GRADE_VALUES = [0, 1, 2, 3] as const;

/** Les quatre échéances possibles (Raté, Difficile, Bien, Facile), en millisecondes depuis maintenant. */
export function previewDelays(card: StoredCard | null, now = new Date()) {
  const input = card ? toFsrsCard(card) : createEmptyCard(now);
  const preview = scheduler.repeat(input, now);
  return GRADE_VALUES.map((grade) => Math.max(0, preview[RATINGS[grade]].card.due.getTime() - now.getTime()));
}

/** « 10 min », « 3 h », « 2 j », « 3 sem. », « 4 mois », « 1 an » : l'intervalle écrit sous un bouton de note. */
export function formatInterval(ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(ms / DAY);
  if (days < 14) return `${days} j`;
  if (days < 60) return `${Math.round(days / 7)} sem.`;
  if (days < 365) return `${Math.round(days / 30)} mois`;
  const years = Math.round((days / 365) * 10) / 10;
  return `${String(years).replace(".", ",")} an${years >= 2 ? "s" : ""}`;
}

/** La même chose en toutes lettres, pour les lecteurs d'écran. */
export function spokenInterval(ms: number) {
  return formatInterval(ms).replace("< 1 min", "moins d’une minute").replace(/ min$/, " minutes").replace(/ h$/, " heures").replace(/ j$/, " jours").replace(/ sem\.$/, " semaines");
}

/** Les libellés des quatre boutons : ce qui est montré au moment de noter. */
export function previewIntervals(card: StoredCard | null, now = new Date()) {
  return previewDelays(card, now).map(formatInterval);
}

/** Probabilité de se souvenir de la fiche maintenant (0 à 1), selon FSRS ; null pour une fiche jamais révisée. */
export function recallProbability(card: StoredCard, now = new Date()) {
  const fsrsCard = toFsrsCard(card);
  if (fsrsCard.state === State.New) return null;
  return scheduler.get_retrievability(fsrsCard, now, false);
}

/** L'état FSRS d'une fiche avant une note, pour pouvoir l'annuler. */
export function snapshotOf(card: StoredCard): CardSnapshot {
  return {
    dueAt: card.dueAt.toISOString(), intervalDays: card.intervalDays, reps: card.reps, stability: card.stability, difficulty: card.difficulty,
    state: card.state, lapses: card.lapses, learningSteps: card.learningSteps, lastReviewedAt: card.lastReviewedAt?.toISOString() ?? null,
  };
}

/** Les colonnes de flashcards à réécrire pour revenir à un état sauvegardé. */
export function restoreSnapshot(snapshot: CardSnapshot) {
  return {
    dueAt: new Date(snapshot.dueAt), intervalDays: snapshot.intervalDays, reps: snapshot.reps, stability: snapshot.stability, difficulty: snapshot.difficulty,
    state: snapshot.state, lapses: snapshot.lapses, learningSteps: snapshot.learningSteps, lastReviewedAt: snapshot.lastReviewedAt ? new Date(snapshot.lastReviewedAt) : null,
  };
}

/** Répartit les documents à revoir sur les jours restants, le dernier jour restant libre. */
export function revisionPlan<T>(items: T[], daysLeft: number) {
  const days = Math.max(1, daysLeft - 1);
  const perDay = Math.ceil(items.length / days);
  const plan: { day: number; items: T[] }[] = [];
  for (let i = 0; i < items.length; i += perDay) plan.push({ day: plan.length, items: items.slice(i, i + perDay) });
  return plan;
}
