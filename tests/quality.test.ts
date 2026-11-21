import { describe, expect, it } from "vitest";
import { sameTeacher, teacherOptions, yearOptions } from "@/lib/doc-facets";
import { cardKey, withoutRemoved } from "@/lib/memo-cards";
import { bayesianScore, compareByRating, ratingLabel } from "@/lib/ratings";
import { reviewWaitMessage, reviewWaitShort, waitingFor } from "@/lib/review-wait";

describe("notes", () => {
  it("masque la moyenne sous trois notes", () => {
    expect(ratingLabel(5, 2)).toBeNull();
    expect(ratingLabel(null, 0)).toBeNull();
    expect(ratingLabel(4.5, 12)).toBe("4,5 (12)");
    expect(ratingLabel(4, 3)).toBe("4,0 (3)");
  });

  it("un seul 5 ne passe pas devant vingt notes à 4,5", () => {
    expect(bayesianScore(4.5, 20)).toBeGreaterThan(bayesianScore(5, 1));
    const lone = { ratingAvg: 5, ratingCount: 1 };
    const solid = { ratingAvg: 4.5, ratingCount: 20 };
    expect([lone, solid].sort(compareByRating)[0]).toBe(solid);
  });

  it("plus il y a de notes, plus la moyenne compte", () => {
    expect(bayesianScore(4.5, 200)).toBeGreaterThan(bayesianScore(4.5, 20));
    expect(bayesianScore(1, 200)).toBeLessThan(bayesianScore(1, 2));
    expect(bayesianScore(3.5, 7)).toBeCloseTo(3.5);
  });

  it("classe un cours sans note après les autres, même mal notés", () => {
    const none = { ratingAvg: null, ratingCount: 0 };
    const low = { ratingAvg: 1, ratingCount: 4 };
    const list = [none, low].sort(compareByRating);
    expect(list[0]).toBe(low);
    expect(compareByRating(none, { ...none })).toBe(0);
  });

  it("à score égal, le cours le plus noté d'abord", () => {
    const few = { ratingAvg: 3.5, ratingCount: 2 };
    const many = { ratingAvg: 3.5, ratingCount: 9 };
    expect([few, many].sort(compareByRating)[0]).toBe(many);
  });
});

describe("enseignant et année", () => {
  it("regroupe les graphies d'un même enseignant et ignore les vides", () => {
    const docs = [{ teacherName: "Mme Élodie Roy" }, { teacherName: "" }, { teacherName: "M. Dupont" }, { teacherName: " m.  dupont " }, { teacherName: "   " }];
    expect(teacherOptions(docs)).toEqual(["M. Dupont", "Mme Élodie Roy"]);
    expect(sameTeacher("mme elodie roy", "Mme Élodie Roy")).toBe(true);
    expect(sameTeacher("M. Dupont", "M. Durand")).toBe(false);
  });

  it("propose les années présentes, la plus récente d'abord", () => {
    expect(yearOptions([{ academicYear: "2024-2025" }, { academicYear: "" }, { academicYear: "2025-2026" }, { academicYear: "2024-2025" }])).toEqual(["2025-2026", "2024-2025"]);
  });
});

describe("fiches retirées", () => {
  const card = (front: string) => ({ front, back: "réponse" });

  it("reconnaît une fiche malgré la casse, les accents et les espaces", () => {
    expect(cardKey("Qu’est-ce que l'élasticité ?")).toBe(cardKey("  qu’est-ce que   l'elasticite ? "));
    expect(cardKey("Question A")).not.toBe(cardKey("Question B"));
    expect(cardKey("x")).toHaveLength(32);
  });

  it("une fiche retirée ne repasse pas", () => {
    const removed = [cardKey("Fiche fausse ?")];
    expect(withoutRemoved([card("Fiche FAUSSE ?"), card("Fiche juste ?")], removed)).toEqual([card("Fiche juste ?")]);
    expect(withoutRemoved([card("a b c")], [])).toHaveLength(1);
  });
});

describe("attente de validation", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

  it("dit depuis quand en mots simples", () => {
    expect(waitingFor(ago(0.2), now)).toBe("moins d’une heure");
    expect(waitingFor(ago(3), now)).toBe("3 h");
    expect(waitingFor(ago(23.9), now)).toBe("23 h");
    expect(waitingFor(ago(25), now)).toBe("1 jour");
    expect(waitingFor(ago(72), now)).toBe("3 jours");
  });

  it("annonce le délai habituel, sans en promettre un nouveau une fois dépassé", () => {
    expect(reviewWaitMessage(ago(3), now)).toBe("Validation sous 24 h en général. Il attend depuis 3 h.");
    const late = reviewWaitMessage(ago(50), now);
    expect(late).toContain("2 jours");
    expect(late).toContain("plus long que d’habitude");
    expect(late).toContain("rappel");
    expect(reviewWaitMessage(null, now)).toBe("Validation sous 24 h en général.");
  });

  it("version courte pour une liste", () => {
    expect(reviewWaitShort(ago(3), now)).toBe("En attente depuis 3 h");
    expect(reviewWaitShort(ago(30), now)).toBe("En attente depuis 1 jour, plus long que d’habitude");
    expect(reviewWaitShort(null, now)).toBe("En attente de validation");
  });
});
