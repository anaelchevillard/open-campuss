import { describe, expect, it } from "vitest";
import { leagueOf, leagueVisible, WEEKLY_CARDS_PER_MEMBER } from "../src/lib/league";
import { advance, describeQuest, drawQuests, fullDays } from "../src/lib/quests";
import { cleanReminderHour, computeStreak, isQuietHour, onVacation, questDayOf, vacationEnd, weekStrip } from "../src/lib/study-habits";
import { composeSession, sessionMinutes, sessionSummary } from "../src/lib/today-session";
import { cardXp, grantXp, levelOfXp, MIN_CARD_MS, quizXp, tierBonus, XP, XP_DAILY_CAP } from "../src/lib/xp";

describe("XP", () => {
  it("récompense l'effort : ratée = difficile, réussie = 2", () => {
    expect(cardXp(0, 4000)).toBe(XP.cardFailed);
    expect(cardXp(1, 4000)).toBe(1);
    expect(cardXp(2, 4000)).toBe(2);
    expect(cardXp(3, 4000)).toBe(2);
  });
  it("une fiche notée en moins de 1,5 s ne rapporte rien", () => {
    expect(cardXp(3, MIN_CARD_MS - 1)).toBe(0);
    expect(cardXp(3, Number.NaN)).toBe(0);
  });
  it("plafonne à 300 par jour", () => {
    expect(grantXp(0, 10)).toBe(10);
    expect(grantXp(295, 10)).toBe(5);
    expect(grantXp(XP_DAILY_CAP, 10)).toBe(0);
    expect(grantXp(400, 10)).toBe(0);
  });
  it("un quiz déjà réussi à 100 % aujourd'hui ne rapporte plus", () => {
    expect(quizXp(4, false)).toBe(12);
    expect(quizXp(4, true)).toBe(0);
  });
  it("niveaux croissants et prévisibles", () => {
    expect(levelOfXp(0).level).toBe(1);
    expect(levelOfXp(99).level).toBe(1);
    expect(levelOfXp(100).level).toBe(2);
    expect(levelOfXp(300)).toMatchObject({ level: 3, into: 0, span: 300 });
  });
  it("un palier ne se gagne qu'au moment où on le franchit", () => {
    expect(tierBonus(2, 3)).toBe(20);
    expect(tierBonus(3, 3)).toBe(0);
    expect(tierBonus(6, 7)).toBe(50);
  });
});

describe("quêtes", () => {
  const base = { hasSession: true, day: "2026-11-06", hasReadCourse: true };
  it("trois quêtes, une seule de contribution", () => {
    const quests = drawQuests({ ...base, weakest: { id: 4 } });
    expect(quests).toHaveLength(3);
    expect(quests.filter((q) => describeQuest(q.quest, () => "Droit civil").contribution)).toHaveLength(1);
  });
  it("partiel proche : un partiel blanc dans sa matière", () => {
    expect(drawQuests({ ...base, examSoon: { subjectId: 7, days: 6 } })[1]).toEqual({ quest: "mock:7", target: 1 });
    expect(drawQuests({ ...base, examSoon: { subjectId: 7, days: 30 }, weakest: { id: 2 } })[1].quest).toBe("weak:2");
  });
  it("même jour, même tirage : rien au hasard", () => {
    expect(drawQuests({ ...base, weakest: { id: 1 } })).toEqual(drawQuests({ ...base, weakest: { id: 1 } }));
    expect(drawQuests({ ...base, day: "2026-11-07" })[2].quest).toBe("thanks");
  });
  it("décrit une quête avec sa matière", () => {
    expect(describeQuest("weak:3", () => "HPE").label).toBe("5 questions en HPE");
    expect(describeQuest("weak:3", () => undefined).label).toBe("5 questions de quiz");
  });
  it("avance sans dépasser, compte les journées pleines", () => {
    expect(advance(4, 3, 5)).toBe(5);
    expect(fullDays([{ day: "a", doneAt: new Date() }, { day: "a", doneAt: new Date() }, { day: "b", doneAt: null }, { day: "b", doneAt: new Date() }])).toBe(1);
  });
});

describe("série, vacances, nuit", () => {
  it("les vacances gèlent la série", () => {
    // 2026-11-02 lundi : révisé le 2, puis vacances jusqu'au 10, révisé le 11
    expect(computeStreak(["2026-11-02", "2026-11-11"], "2026-11-11").streak).toBe(1);
    expect(computeStreak(["2026-11-02", "2026-11-11"], "2026-11-11", "2026-11-10").streak).toBe(2);
    expect(onVacation("2026-11-10", "2026-11-10")).toBe(true);
    expect(onVacation("2026-10-20", "2026-11-10")).toBe(false);
  });
  it("la semaine montre repos et jours faits, jamais de reproche", () => {
    const week = weekStrip(["2026-11-02", "2026-11-05"], "2026-11-06");
    expect(week.map((d) => d.state)).toEqual(["done", "rest", "rest", "done", "today", "future", "future"]);
    expect(weekStrip(["2026-11-05"], "2026-11-06").map((d) => d.state).slice(0, 3)).toEqual(["rest", "rest", "off"]);
  });
  it("vacances de 1 à 14 jours, rappel de 7 h à 22 h", () => {
    expect(vacationEnd("2026-11-06", 7)).toBe("2026-11-12");
    expect(vacationEnd("2026-11-06", 40)).toBe("2026-11-19");
    expect(vacationEnd("2026-11-06", 0)).toBeNull();
    expect(cleanReminderHour(23)).toBeNull();
    expect(cleanReminderHour("18")).toBe(18);
  });
  it("pas de bonus entre 1 h et 5 h, journée de quêtes à 4 h", () => {
    expect(isQuietHour(new Date("2026-11-06T01:30:00Z"))).toBe(true); // 2 h 30 à Paris
    expect(isQuietHour(new Date("2026-11-06T05:30:00Z"))).toBe(false);
    expect(questDayOf(new Date("2026-11-06T01:30:00Z"))).toBe("2026-11-05");
    expect(questDayOf(new Date("2026-11-06T04:30:00Z"))).toBe("2026-11-06");
  });
});

describe("ligue d'amis", () => {
  it("coopérative : objectif commun, rangs partagés à égalité", () => {
    const league = leagueOf([{ id: "a", name: "Ana", xp: 50, cards: 40, me: true }, { id: "b", name: "Bo", xp: 80, cards: 60 }, { id: "c", name: "Cy", xp: 50, cards: 10 }]);
    expect(league.rows.map((r) => r.rank)).toEqual([1, 2, 2]);
    expect(league.total).toBe(110);
    expect(league.target).toBe(3 * WEEKLY_CARDS_PER_MEMBER);
    expect(league.myRank).toBe(2);
  });
  it("visible seulement si je partage et un ami aussi", () => {
    expect(leagueVisible(true, 0)).toBe(false);
    expect(leagueVisible(false, 3)).toBe(false);
    expect(leagueVisible(true, 1)).toBe(true);
  });
});

describe("séance du jour (todayPlan)", () => {
  const due = Array.from({ length: 4 }, (_, i) => ({ id: `c${i}`, front: `Q${i}`, back: `R${i}` }));
  const decks = [{ docId: "d1", subjectId: 1, cards: Array.from({ length: 8 }, (_, i) => ({ front: `N${i}`, back: `B${i}` })) }];
  const quiz = { docId: "d2", subjectId: 2, questions: Array.from({ length: 6 }, (_, i) => ({ question: `QQ${i}`, choices: ["a", "b"] })) };
  it("fiches dues, puis nouvelles, puis 3 questions", () => {
    const s = composeSession({ due, decks, known: new Set(["d1|N0"]), quiz, day: "2026-11-06" });
    expect(s.items.map((i) => i.kind)).toEqual(["card", "card", "card", "card", "new", "new", "new", "new", "new", "question", "question", "question"]);
    expect(s.items.find((i) => i.kind === "new")).toMatchObject({ front: "N1" });
    expect(s.counts).toEqual({ cards: 4, fresh: 5, questions: 3 });
  });
  it("même entrée, même séance", () => {
    const a = composeSession({ due, decks, known: new Set(), quiz, day: "2026-11-06" });
    const b = composeSession({ due, decks, known: new Set(), quiz, day: "2026-11-06" });
    expect(a).toEqual(b);
  });
  it("beaucoup de fiches dues : pas de nouveautés", () => {
    const many = Array.from({ length: 35 }, (_, i) => ({ id: `m${i}`, front: "f", back: "b" }));
    expect(composeSession({ due: many, decks, known: new Set(), day: "2026-11-06" }).counts.fresh).toBe(0);
  });
  it("durée et résumé", () => {
    expect(sessionMinutes([])).toBe(0);
    expect(sessionMinutes([{ kind: "card" }])).toBe(2);
    expect(sessionSummary({ cards: 12, fresh: 0, questions: 3 })).toBe("12 fiches · 3 questions");
  });
});
