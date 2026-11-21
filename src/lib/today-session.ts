/**
 * Composition de la « Séance du jour », logique pure partagée par l'accueil, Réviser et la séance elle-même :
 * fiches dues (FSRS), puis 3 à 5 nouvelles fiches tirées des paquets des cours lus ou favoris, puis 3 questions
 * de la matière la plus faible. Même entrée, même séance : rien n'est tiré au hasard.
 */
export type SessionSubject = { id: number; name: string };

/** `previews` : l'intervalle qui suivra chacune des 4 notes (Raté, Difficile, Bien, Facile), calculé par FSRS côté serveur. */
export type SessionItem =
  | { kind: "card"; id: string; front: string; back: string; subjectId?: number | null; previews?: string[]; fresh?: boolean }
  | { kind: "new"; docId: string; index: number; front: string; back: string; subjectId?: number | null; previews?: string[] }
  | { kind: "question"; docId: string; index: number; question: string; choices: string[]; subjectId?: number | null };

export type SessionCounts = { cards: number; fresh: number; questions: number };

export const MAX_DUE = 40;
export const NEW_WHEN_FEW = 5;
export const NEW_WHEN_SOME = 3;
export const QUESTIONS = 3;
/** Au-delà de 30 fiches dues, on ne rajoute pas de nouveautés : il y a déjà de quoi faire. */
export const NO_NEW_ABOVE = 30;

const SECONDS = { card: 12, new: 20, question: 25 } as const;

type Due = { id: string; front: string; back: string; subjectId?: number | null; previews?: string[]; fresh?: boolean };
type Deck = { docId: string; subjectId?: number | null; cards: { front: string; back: string }[] };
type Quiz = { docId: string; subjectId?: number | null; questions: { question: string; choices: string[] }[] };

/** Petit hachage stable : la rotation des questions change chaque jour sans hasard. */
export function dayHash(day: string) {
  let hash = 0;
  for (const char of day) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

export function composeSession({ due, decks, known, quiz, day, newCount, questionCount = QUESTIONS }: {
  due: Due[];
  /** Paquets des cours lus ou favoris, dans l'ordre de préférence. */
  decks: Deck[];
  /** Fiches déjà adoptées : « documentId|recto ». Elles ne reviennent pas comme nouvelles. */
  known: Set<string>;
  quiz?: Quiz | null;
  day: string;
  newCount?: number;
  questionCount?: number;
}) {
  const items: SessionItem[] = due.slice(0, MAX_DUE).map((card) => ({ kind: "card", ...card }));
  const wanted = newCount ?? (due.length > NO_NEW_ABOVE ? 0 : due.length > 10 ? NEW_WHEN_SOME : NEW_WHEN_FEW);
  let fresh = 0;
  for (const deck of decks) {
    if (fresh >= wanted) break;
    deck.cards.forEach((card, index) => {
      if (fresh >= wanted || known.has(`${deck.docId}|${card.front}`)) return;
      items.push({ kind: "new", docId: deck.docId, index, front: card.front, back: card.back, subjectId: deck.subjectId });
      fresh++;
    });
  }
  let questions = 0;
  if (quiz?.questions.length && questionCount > 0) {
    const start = dayHash(day) % quiz.questions.length;
    for (let i = 0; i < Math.min(questionCount, quiz.questions.length); i++) {
      const index = (start + i) % quiz.questions.length;
      const q = quiz.questions[index];
      items.push({ kind: "question", docId: quiz.docId, index, question: q.question, choices: q.choices, subjectId: quiz.subjectId });
      questions++;
    }
  }
  const counts: SessionCounts = { cards: Math.min(due.length, MAX_DUE), fresh, questions };
  return { items, counts, minutes: sessionMinutes(items) };
}

export function sessionMinutes(items: Pick<SessionItem, "kind">[]) {
  if (!items.length) return 0;
  const seconds = items.reduce((sum, item) => sum + SECONDS[item.kind], 0);
  return Math.max(2, Math.ceil(seconds / 60));
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

/** « 12 fiches · 3 nouvelles · 3 questions » : seulement ce qui existe. */
export function sessionSummary(counts: SessionCounts) {
  return [
    counts.cards ? plural(counts.cards, "fiche") : "",
    counts.fresh ? plural(counts.fresh, "nouvelle", "nouvelles") : "",
    counts.questions ? plural(counts.questions, "question") : "",
  ].filter(Boolean).join(" · ");
}

export const sessionSize = (counts: SessionCounts) => counts.cards + counts.fresh + counts.questions;
