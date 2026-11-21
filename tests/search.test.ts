import { describe, expect, it } from "vitest";
import { cleanSnippet, guessSubject, headlineParts, MARK_END, MARK_START, searchType, shouldProposeRequest } from "@/lib/search-rules";

const subjects = [
  { id: 1, name: "Microéconomie", shortName: "Micro" },
  { id: 2, name: "Histoire de la pensée économique", shortName: "HPE" },
  { id: 3, name: "Statistiques descriptives", shortName: "Stats" },
];

describe("recherche", () => {
  it("propose une demande à partir de 4 caractères et au plus 2 résultats", () => {
    expect(shouldProposeRequest("td", 0)).toBe(false);
    expect(shouldProposeRequest("  t d ", 0)).toBe(false);
    expect(shouldProposeRequest("chap 3", 2)).toBe(true);
    expect(shouldProposeRequest("chap 3", 3)).toBe(false);
  });

  it("devine la matière par le nom court ou un mot du nom", () => {
    expect(guessSubject("chapitre 3 HPE", subjects)).toBe(2);
    expect(guessSubject("partiel microéconomie 2025", subjects)).toBe(1);
    expect(guessSubject("microeco élasticité", subjects)).toBe(1);
    expect(guessSubject("statistiques descriptives TD 4", subjects)).toBe(3);
  });

  it("sinon la matière d'où l'on cherche, si elle existe", () => {
    expect(guessSubject("chapitre 3", subjects, 3)).toBe(3);
    expect(guessSubject("chapitre 3", subjects, 99)).toBe(null);
    expect(guessSubject("chapitre 3", subjects)).toBe(null);
  });

  it("extrait : morceaux surlignés, sans HTML ni Markdown", () => {
    const parts = headlineParts(`la **courbe** de ${MARK_START}demande${MARK_END} <b>baisse</b>`);
    expect(parts).toEqual([{ text: "la courbe de ", mark: false }, { text: "demande", mark: true }, { text: " <b>baisse</b>", mark: false }]);
    expect(cleanSnippet("## Titre [lien](http://x) ![img](a.png)")).toBe("Titre lien");
  });

  it("types de recherche fermés", () => {
    expect(searchType("td")).toBe("td");
    expect(searchType("projet")).toBe(null);
    expect(searchType(null)).toBe(null);
  });
});
