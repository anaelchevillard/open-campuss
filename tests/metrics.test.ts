import { describe, expect, it } from "vitest";
import { coverageOf, delayReached, formatDelay, shareReached, shareView } from "@/lib/metrics";

describe("indicateurs", () => {
  it("donne le compte brut tant qu'il y a trop peu de monde", () => {
    expect(shareView({ n: 1, total: 2 })).toEqual({ value: "1 sur 2", detail: null, enough: false });
    expect(shareView({ n: 0, total: 0 }).value).toBeNull();
  });

  it("passe au pourcentage à partir de 20 comptes", () => {
    expect(shareView({ n: 5, total: 20 })).toEqual({ value: "25\u00a0%", detail: "5 sur 20", enough: true });
  });

  it("ne juge pas un objectif sur trop peu de données", () => {
    expect(shareReached({ n: 2, total: 2 }, 50)).toBeNull();
    expect(shareReached({ n: 10, total: 20 }, 50)).toBe(true);
    expect(shareReached({ n: 9, total: 20 }, 50)).toBe(false);
  });

  it("compare le délai à 24 h, une fois assez de validations", () => {
    expect(delayReached(3600, 2)).toBeNull();
    expect(delayReached(null, 9)).toBeNull();
    expect(delayReached(23 * 3600, 5)).toBe(true);
    expect(delayReached(24 * 3600, 5)).toBe(false);
  });

  it("écrit un délai dans l'unité qui se lit", () => {
    expect(formatDelay(20)).toBe("1\u00a0min");
    expect(formatDelay(45 * 60)).toBe("45\u00a0min");
    expect(formatDelay(23.9 * 3600)).toBe("23\u00a0h");
    expect(formatDelay(5 * 86_400)).toBe("5\u00a0j");
  });

  it("compte la couverture par année, et la L1 toutes licences confondues", () => {
    const row = (programId: number, level: number, subjectId: number, courses: number) => ({ programId, program: `P${programId}`, level, subjectId, subject: `M${subjectId}`, courses });
    const { programs, firstYear } = coverageOf([row(1, 1, 1, 3), row(1, 1, 2, 0), row(1, 2, 3, 1), row(2, 1, 4, 1)]);
    expect(firstYear).toEqual({ n: 2, total: 3 });
    expect(programs).toHaveLength(2);
    expect(programs[0].levels.map((l) => [l.level, l.share])).toEqual([[1, { n: 1, total: 2 }], [2, { n: 1, total: 1 }]]);
    expect(programs[0].levels[0].subjects[0]).toEqual({ id: 1, name: "M1", courses: 3 });
  });
});
