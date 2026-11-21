/** Niveau de préparation d'une matière : formule pure, expliquée telle quelle à l'étudiant. */
export const TARGET_INTERVAL_DAYS = 21;
export const MIN_CARDS = 5;
export const MIN_QUIZZES_TRIED = 2;
const CARD_WEIGHT = 0.7;
const QUIZ_WEIGHT = 0.3;

export type ReadinessInput = {
  /** Les fiches de la personne dont le document appartient à cette matière. */
  cards: { intervalDays: number; reviewed: boolean }[];
  /** Le dernier essai de chaque quiz tenté. */
  tried: { score: number; total: number }[];
  /** Les quiz disponibles dans la matière. */
  quizCount: number;
};

export type Readiness =
  | { known: false; detail: string }
  | { known: true; percent: number; detail: string };

export const READINESS_FORMULA = "Calculé d’après tes fiches, surtout, et tes quiz de la matière.";

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

export function readiness({ cards, tried, quizCount }: ReadinessInput): Readiness {
  // Une fiche jamais révisée ne dit encore rien : elle pèse dans le calcul, mais ne compte pas comme donnée
  const reviewed = cards.filter((card) => card.reviewed).length;
  const enoughCards = reviewed >= MIN_CARDS;
  const enoughQuizzes = tried.length >= MIN_QUIZZES_TRIED;
  if (!enoughCards && !enoughQuizzes) {
    return { known: false, detail: `Pas encore assez de données pour estimer : il faut ${MIN_CARDS} fiches révisées, liées à un cours de la matière (${reviewed} pour l’instant), ou ${MIN_QUIZZES_TRIED} quiz tentés (${tried.length}).` };
  }
  const mastered = cards.filter((card) => card.intervalDays >= TARGET_INTERVAL_DAYS).length;
  const cardPart = cards.reduce((sum, card) => sum + Math.min(1, Math.max(0, card.intervalDays) / TARGET_INTERVAL_DAYS), 0) / (cards.length || 1);
  const available = Math.max(quizCount, tried.length, 1);
  const quizPart = tried.reduce((sum, quiz) => sum + (quiz.total > 0 ? Math.min(1, quiz.score / quiz.total) : 0), 0) / available;
  const value = enoughCards && enoughQuizzes ? cardPart * CARD_WEIGHT + quizPart * QUIZ_WEIGHT : enoughCards ? cardPart : quizPart;
  const facts = [
    enoughCards ? `${mastered} ${mastered > 1 ? "fiches maîtrisées" : "fiche maîtrisée"} sur ${cards.length}` : "",
    enoughQuizzes ? `${plural(tried.length, "quiz")} sur ${available}` : "",
  ].filter(Boolean);
  return { known: true, percent: Math.round(value * 100), detail: facts.join(", ") };
}
