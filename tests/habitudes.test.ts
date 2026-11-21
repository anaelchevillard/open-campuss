import { describe, expect, it } from "vitest";
import { MIN_CARDS, readiness, READINESS_FORMULA } from "../src/lib/readiness";
import { lastDayOf, seasonBanner, seasonOf, shouldAnnounceSeason } from "../src/lib/seasons";
import { cleanGoal, computeStreak, parisDay, parisLocalToDate, streakLine, weekOf } from "../src/lib/study-habits";

describe("jour de Paris", () => {
  it("change à minuit à Paris, pas à minuit UTC", () => {
    expect(parisDay(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-02");
    expect(parisDay(new Date("2026-12-01T22:30:00Z"))).toBe("2026-12-01");
    expect(parisDay(new Date("2026-12-01T23:30:00Z"))).toBe("2026-12-02");
  });
  it("traverse le changement d'heure", () => {
    expect(parisDay(new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-25");
    expect(parisDay(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-26");
  });
  it("lit une saisie sans fuseau comme une heure de Paris", () => {
    expect(parisLocalToDate("2026-07-01T12:00")?.toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(parisLocalToDate("2026-12-01T12:00")?.toISOString()).toBe("2026-12-01T11:00:00.000Z");
    expect(parisLocalToDate("2026-02-31T12:00")).toBeNull();
    expect(parisLocalToDate("demain")).toBeNull();
  });
});

describe("série", () => {
  // 2026-11-02 est un lundi
  it("la semaine commence le lundi", () => {
    expect(weekOf("2026-11-08")).toBe("2026-11-02");
    expect(weekOf("2026-11-02")).toBe("2026-11-02");
  });
  it("sans révision, pas de série", () => {
    expect(computeStreak([], "2026-11-04").streak).toBe(0);
  });
  it("aujourd'hui n'est pas encore un jour manqué", () => {
    expect(computeStreak(["2026-11-03", "2026-11-04"], "2026-11-05").streak).toBe(2);
    expect(computeStreak(["2026-11-03", "2026-11-04", "2026-11-05"], "2026-11-05")).toEqual({ streak: 3, activeToday: true });
  });
  it("deux jours manqués dans la semaine ne coupent pas", () => {
    expect(computeStreak(["2026-11-02", "2026-11-05", "2026-11-06"], "2026-11-06").streak).toBe(3);
  });
  it("le troisième jour manqué de la semaine coupe", () => {
    expect(computeStreak(["2026-11-02", "2026-11-06", "2026-11-07"], "2026-11-07").streak).toBe(2);
  });
  it("les jours de repos se comptent semaine par semaine", () => {
    // samedi et dimanche, puis lundi et mardi : deux jours dans chaque semaine
    expect(computeStreak(["2026-11-06", "2026-11-11"], "2026-11-11").streak).toBe(2);
  });
  it("traverse le changement d'heure et ignore le futur", () => {
    expect(computeStreak(["2026-10-24", "2026-10-25", "2026-10-26"], "2026-10-26").streak).toBe(3);
    expect(computeStreak(["2026-11-09"], "2026-11-05").streak).toBe(0);
  });
  it("ne dit rien quand il n'y a pas de série, et jamais de reproche", () => {
    expect(streakLine(0)).toBe("");
    expect(streakLine(1)).toContain("1 jour,");
    expect(streakLine(12)).not.toMatch(/perdu|cassé|rompu/i);
  });
  it("refuse un objectif hors de la liste", () => {
    expect(cleanGoal(10)).toBe(10);
    expect(cleanGoal(-3)).toBe(5);
    expect(cleanGoal("x")).toBe(5);
  });
});

const cards = (n: number, intervalDays: number, reviewed = true) => Array.from({ length: n }, () => ({ intervalDays, reviewed }));

describe("préparation", () => {
  it("avoue manquer de données plutôt que donner un chiffre", () => {
    const result = readiness({ cards: cards(MIN_CARDS - 1, 30), tried: [{ score: 5, total: 5 }], quizCount: 1 });
    expect(result.known).toBe(false);
    expect(result).not.toHaveProperty("percent");
  });
  it("des fiches jamais révisées ne suffisent pas", () => {
    expect(readiness({ cards: cards(20, 0, false), tried: [], quizCount: 0 }).known).toBe(false);
  });
  it("fiches seules : progression vers 21 jours", () => {
    expect(readiness({ cards: [...cards(5, 21), ...cards(5, 0)], tried: [], quizCount: 0 })).toMatchObject({ known: true, percent: 50 });
    expect(readiness({ cards: cards(5, 400), tried: [], quizCount: 0 })).toMatchObject({ percent: 100 });
  });
  it("quiz seuls : ceux non tentés comptent zéro", () => {
    expect(readiness({ cards: [], tried: [{ score: 10, total: 10 }, { score: 10, total: 10 }], quizCount: 4 })).toMatchObject({ known: true, percent: 50 });
  });
  it("les deux : 70 % fiches, 30 % quiz", () => {
    expect(readiness({ cards: cards(5, 21), tried: [{ score: 0, total: 10 }, { score: 0, total: 10 }], quizCount: 2 })).toMatchObject({ percent: 70 });
    expect(READINESS_FORMULA).toContain("fiches");
  });
  it("supporte un quiz sans question", () => {
    expect(readiness({ cards: [], tried: [{ score: 0, total: 0 }, { score: 1, total: 1 }], quizCount: 2 })).toMatchObject({ percent: 50 });
  });
});

describe("saisons", () => {
  it("découpe en automne et printemps, à l'heure de Paris", () => {
    expect(seasonOf(new Date("2026-11-02T12:00:00Z")).key).toBe("2026-S1");
    expect(seasonOf(new Date("2027-01-15T12:00:00Z")).key).toBe("2026-S1");
    expect(seasonOf(new Date("2027-01-31T23:30:00Z")).key).toBe("2027-S2");
    expect(seasonOf(new Date("2027-08-31T22:30:00Z")).key).toBe("2027-S1");
    expect(seasonOf(new Date("2026-11-02T12:00:00Z")).start.toISOString()).toBe("2026-08-31T22:00:00.000Z");
  });
  it("annonce le dernier jour", () => {
    expect(lastDayOf(seasonOf(new Date("2026-11-02T12:00:00Z")))).toBe("31 janvier");
  });
  it("n'annonce pas une saison déjà bien entamée", () => {
    const season = seasonOf(new Date("2026-11-02T12:00:00Z"));
    expect(shouldAnnounceSeason(season, new Date("2026-09-03T12:00:00Z"))).toBe(true);
    expect(shouldAnnounceSeason(season, new Date("2026-11-02T12:00:00Z"))).toBe(false);
  });
  it("le bandeau fermé revient à la saison suivante seulement", () => {
    const season = seasonOf(new Date("2026-09-03T12:00:00Z"));
    expect(seasonBanner(season, "2026-S1", new Date("2026-09-03T12:00:00Z"))).toBeNull();
    expect(seasonBanner(season, "2026-S2", new Date("2026-09-03T12:00:00Z"))).toEqual({ fresh: true });
    expect(seasonBanner(season, null, new Date("2026-12-03T12:00:00Z"))).toEqual({ fresh: false });
  });
});
