/**
 * Partiel blanc : logique pure, testée dans tests/partiel-blanc.test.ts.
 *
 * Minimum : le mode annonce « 10 questions chronométrées ». Avant, 3 questions suffisaient (un seul quiz de 3 questions
 * faisait un « partiel ») et le message « pas assez de quiz » ne disait ni pourquoi ni quoi faire. Désormais : 5 questions
 * au moins (un quiz Campuss IA en compte 5 à 8), 10 au plus, tirées à tour de rôle dans les quiz des cours de la matière.
 */

export const MOCK_MIN_QUESTIONS = 5;
export const MOCK_MAX_QUESTIONS = 10;
/** Un partiel avec ses fiches : QCM à 4 choix, il faut donc 4 fiches aux réponses différentes. */
export const CARDS_MOCK_MIN = 4;

export type QuizSource = { docId: string; questions: number };

/** Combien de questions un partiel blanc peut tirer de ces quiz (le tirage s'arrête à 10). */
export function mockQuestionCount(sources: QuizSource[]) {
  return Math.min(MOCK_MAX_QUESTIONS, sources.reduce((sum, s) => sum + Math.max(0, s.questions), 0));
}

export const mockEnough = (sources: QuizSource[]) => mockQuestionCount(sources) >= MOCK_MIN_QUESTIONS;

/** La phrase qui explique pourquoi il n'y a pas de partiel blanc dans cette matière. */
export function mockShortfall(sources: QuizSource[], subject: string) {
  const questions = mockQuestionCount(sources);
  const courses = sources.filter((s) => s.questions > 0).length;
  if (!courses) return `Un partiel blanc tire ses questions des quiz des cours de ${subject}, et aucun cours de cette matière n’a encore de quiz.`;
  return `Un partiel blanc tire ses questions des quiz des cours de ${subject}. Il en faut au moins ${MOCK_MIN_QUESTIONS} ; pour l’instant, ${courses > 1 ? `${courses} cours en ont` : "1 cours en a"} ${questions}.`;
}

export type MockCard = { id: string; front: string; back: string };
export type CardQuestion = { cardId: string; question: string; choices: string[]; choiceIds: string[] };

/** Mélange de Fisher-Yates, avec un tirage fourni (testable). */
export function shuffle<T>(items: T[], random: () => number = Math.random) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/**
 * Un partiel avec ses propres fiches : le recto devient la question, le bon verso est mêlé à 3 versos d'autres fiches.
 * Seules les fiches aux réponses distinctes servent de leurres ; la correction se fait sur le serveur, par identifiant.
 */
export function cardsMockQuestions(cards: MockCard[], max = MOCK_MAX_QUESTIONS, random: () => number = Math.random): CardQuestion[] {
  const byBack = new Map<string, MockCard>();
  for (const card of cards) if (!byBack.has(card.back.trim())) byBack.set(card.back.trim(), card);
  const distinct = [...byBack.values()];
  if (distinct.length < CARDS_MOCK_MIN) return [];
  return shuffle(distinct, random).slice(0, max).map((card) => {
    const decoys = shuffle(distinct.filter((other) => other.id !== card.id), random).slice(0, CARDS_MOCK_MIN - 1);
    const options = shuffle([card, ...decoys], random);
    return { cardId: card.id, question: card.front, choices: options.map((o) => o.back), choiceIds: options.map((o) => o.id) };
  });
}
