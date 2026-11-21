import { describe, expect, it } from "vitest";
import {
  categoryCount, categoryCountsLabel, countByCategory, countsByKey, defaultCategory, publishedWord, selectedCategory, totalOf,
} from "@/lib/category-counts";

describe("Un type toujours choisi sur la page d'une matière", () => {
  it("les CM d'office, même sans type dans l'adresse", () => {
    const counts = { cours: 2, fiche: 1 };
    expect(selectedCategory(null, counts)).toBe("cours");
    expect(selectedCategory("", counts)).toBe("cours");
  });
  it("le type de l'adresse s'il est présent dans la matière", () => {
    expect(selectedCategory("fiche", { cours: 2, fiche: 1 })).toBe("fiche");
  });
  it("un type absent ou inconnu retombe sur le type par défaut", () => {
    expect(selectedCategory("partiel", { cours: 2 })).toBe("cours");
    expect(selectedCategory("tout", { cours: 2 })).toBe("cours");
    expect(selectedCategory("constructor", { cours: 2 })).toBe("cours");
  });
  it("sans CM : le premier type présent, dans l'ordre de lecture", () => {
    expect(defaultCategory({ projet: 1, fiche: 3, td: 2 })).toBe("td");
    expect(defaultCategory({})).toBeNull();
  });
});

describe("Compter et nommer par type", () => {
  it("une fiche ou un partiel n'est jamais « un cours »", () => {
    const label = categoryCountsLabel(countByCategory([{ category: "cours" }, { category: "cours" }, { category: "fiche" }, { category: "partiel" }, { category: "td" }]));
    expect(label).toBe("2 CM · 1 TD · 1 fiche · 1 partiel");
    expect(label).not.toMatch(/cours/);
  });
  it("accorde le pluriel, pas pour CM ni TD", () => {
    expect(categoryCount("fiche", 3)).toBe("3 fiches");
    expect(categoryCount("cours", 3)).toBe("3 CM");
    expect(categoryCount("td", 1)).toBe("1 TD");
    expect(publishedWord("fiche", 2)).toBe("fiches publiées");
    expect(publishedWord("cours", 1)).toBe("CM publié");
  });
  it("rien de publié, préfixe et séparateur", () => {
    expect(categoryCountsLabel({})).toBe("Rien de publié");
    expect(categoryCountsLabel({ cours: 2, fiche: 1 }, { prefix: "+", separator: " " })).toBe("+2 CM +1 fiche");
    expect(categoryCountsLabel({ cours: 2, fiche: 1 }, { separator: ", " })).toBe("2 CM, 1 fiche");
  });
  it("lignes groupées par clé et type ; les types inconnus sont ignorés", () => {
    const map = countsByKey([{ key: 1, category: "cours", n: 2 }, { key: 1, category: "fiche", n: 1 }, { key: 2, category: "inconnu", n: 9 }]);
    expect(map.get(1)).toEqual({ cours: 2, fiche: 1 });
    expect(map.has(2)).toBe(false);
    expect(totalOf(map.get(1)!)).toBe(3);
    expect(countByCategory([{ category: "td", n: 4 }, { category: "td", n: 1 }])).toEqual({ td: 5 });
  });
});
