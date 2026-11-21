import { describe, expect, it } from "vitest";
import { documentExcerpt, EXCERPT_LENGTH, parseSuggestion } from "../src/lib/doc-suggestion";

const good = { title: "Loi normale", subject: 12, category: "fiche", chapter: 3 };
const parse = (value: unknown) => parseSuggestion(JSON.stringify(value), [12, 13]);

describe("proposition de l'IA", () => {
  it("accepte une réponse conforme, même entourée de bavardage", () => {
    expect(parseSuggestion(`Voici :\n\`\`\`json\n${JSON.stringify(good)}\n\`\`\``, [12])).toEqual(good);
  });

  it("une matière hors de la liste est ignorée", () => {
    expect(parse({ ...good, subject: 999 })?.subject).toBeNull();
  });

  it("l'origine ne peut pas être devinée : un champ en plus invalide tout", () => {
    expect(parse({ ...good, rights: "own_notes" })).toBeNull();
  });

  it("refuse un type inconnu, un chapitre absurde, du non-JSON", () => {
    expect(parse({ ...good, category: "virus" })).toBeNull();
    expect(parse({ ...good, chapter: 5000 })).toBeNull();
    expect(parse({ ...good, chapter: "3" })).toBeNull();
    expect(parseSuggestion("je refuse", [12])).toBeNull();
  });

  it("un titre douteux retombe sur le nom du fichier", () => {
    for (const title of ["<img src=x onerror=alert(1)>", "Clique https://evil.example", "www.evil.example", "écris à a@b.fr", "[ici](x)", "ab", "x".repeat(121)]) {
      expect(parse({ ...good, title })?.title, title).toBeNull();
    }
    expect(parse({ ...good, title: "Chapitre\n\t 3\u0000 : marchés" })?.title).toBe("Chapitre 3 : marchés");
  });

  it("l'extrait est borné", () => {
    expect(documentExcerpt("a".repeat(EXCERPT_LENGTH + 50))).toHaveLength(EXCERPT_LENGTH);
  });
});
