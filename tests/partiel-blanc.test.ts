import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CARDS_MOCK_MIN, cardsMockQuestions, MOCK_MAX_QUESTIONS, MOCK_MIN_QUESTIONS, mockEnough, mockQuestionCount, mockShortfall, shuffle } from "../src/lib/mock-exam";

const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const cards = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, front: `Question ${i}`, back: `Réponse ${i}` }));

describe("Partiel blanc : minimum de quiz", () => {
  it("5 questions au moins, 10 au plus", () => {
    expect(MOCK_MIN_QUESTIONS).toBe(5);
    expect(mockQuestionCount([{ docId: "a", questions: 8 }, { docId: "b", questions: 8 }])).toBe(MOCK_MAX_QUESTIONS);
    expect(mockEnough([{ docId: "a", questions: 3 }])).toBe(false);
    expect(mockEnough([{ docId: "a", questions: 3 }, { docId: "b", questions: 2 }])).toBe(true);
  });

  it("dit pourquoi : aucun quiz, ou combien il en manque", () => {
    expect(mockShortfall([], "économie")).toMatch(/aucun cours de cette matière n’a encore de quiz/);
    expect(mockShortfall([{ docId: "a", questions: 3 }], "économie")).toMatch(/au moins 5 ; pour l’instant, 1 cours en a 3/);
  });

  it("le seuil de la séance est celui de la bibliothèque (plus de « 3 questions » codé en dur)", () => {
    const page = readFileSync(new URL("../src/app/reviser/seance/page.tsx", import.meta.url), "utf8");
    expect(page).toContain("questions.length < MOCK_MIN_QUESTIONS");
    expect(page).not.toMatch(/questions\.length < 3/);
  });
});

describe("Partiel avec ses fiches", () => {
  it("chaque question a 4 réponses distinctes dont la bonne, identifiées pour la correction serveur", () => {
    const questions = cardsMockQuestions(cards, 10, seeded());
    expect(questions).toHaveLength(8);
    for (const q of questions) {
      expect(q.choices).toHaveLength(CARDS_MOCK_MIN);
      expect(new Set(q.choiceIds).size).toBe(CARDS_MOCK_MIN);
      expect(q.choiceIds).toContain(q.cardId);
      const card = cards.find((c) => c.id === q.cardId)!;
      expect(q.question).toBe(card.front);
      expect(q.choices[q.choiceIds.indexOf(q.cardId)]).toBe(card.back);
    }
  });

  it("moins de 4 réponses différentes : pas de partiel (les doublons de verso ne comptent pas)", () => {
    const same = [...cards.slice(0, 3), { id: "x", front: "autre", back: "Réponse 0" }];
    expect(cardsMockQuestions(same)).toEqual([]);
  });

  it("au plus 10 questions, mélange stable avec un tirage fourni", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, front: `Q${i}`, back: `R${i}` }));
    expect(cardsMockQuestions(many, 10, seeded())).toHaveLength(10);
    expect(shuffle([1, 2, 3, 4], seeded(3))).toEqual(shuffle([1, 2, 3, 4], seeded(3)));
    expect(shuffle([1, 2, 3, 4], seeded()).sort()).toEqual([1, 2, 3, 4]);
  });

  it("la correction serveur ne porte que sur les fiches de la personne, sans XP", () => {
    const action = readFileSync(new URL("../src/app/actions/mock-exam.ts", import.meta.url), "utf8");
    const submit = action.slice(action.indexOf("export async function submitCardsMock"));
    expect(submit).toContain("eq(flashcards.userId, user.id)");
    expect(submit).toContain("xp: 0");
    expect(submit).toMatch(/rateLimited\(key, 40, 1440\)/);
    const request = action.slice(action.indexOf("export async function requestSubjectQuizzes"), action.indexOf("const cardAnswers"));
    expect(request).toContain("subject.programId !== user.programId");
    expect(request).toMatch(/rateLimited\(key, QUIZ_REQUESTS_PER_DAY, 1440\)/);
    expect(request).toContain("eq(documents.published, true)");
  });
});
