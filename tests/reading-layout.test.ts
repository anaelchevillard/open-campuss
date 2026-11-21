import { describe, expect, test } from "vitest";
import { FRAME, matchesBlock, notesColumnWidth, notesInColumn, tocMode } from "../src/lib/reading-layout";

describe("grille de lecture", () => {
  test("sous 48rem, le sommaire passe dans la barre de lecture", () => {
    expect(tocMode(40, false, 0, 5)).toBe("none");
  });
  test("entre 48 et 73rem : rail à la souris, bouton flottant au doigt", () => {
    expect(tocMode(60, false, 0, 5)).toBe("rail");
    expect(tocMode(60, true, 0, 5)).toBe("fab");
  });
  test("entre 73 et 103rem : liste sans note, rail dès qu'une note existe", () => {
    expect(tocMode(80, false, 0, 5)).toBe("list");
    expect(tocMode(80, false, 2, 5)).toBe("rail");
  });
  test("au-delà de 103rem : la liste reste à côté des notes", () => {
    expect(tocMode(110, false, 3, 5)).toBe("list");
  });
  test("pas de sommaire pour un seul titre", () => {
    expect(tocMode(110, false, 0, 1)).toBe("none");
  });
  test("les notes sont dans la marge dès que la grille en a une (48rem), en pastilles en dessous", () => {
    expect(notesInColumn(FRAME.narrow - 0.1)).toBe(false);
    expect(notesInColumn(FRAME.narrow)).toBe(true);
    expect(notesInColumn(FRAME.notes)).toBe(true);
  });
  test("colonne des notes étroite sous 73rem, large au-delà", () => {
    expect(notesColumnWidth(60)).toBe(14);
    expect(notesColumnWidth(FRAME.notes)).toBe(16);
  });
});

describe("recherche du menu « / »", () => {
  const item = { title: "Définition", aliases: ["callout", "encadre"] };
  test("sans accents", () => expect(matchesBlock(item, "defini")).toBe(true));
  test("par alias anglais, au début", () => {
    expect(matchesBlock(item, "call")).toBe(true);
    expect(matchesBlock(item, "out")).toBe(false);
  });
  test("une requête sans rapport ne trouve rien", () => expect(matchesBlock(item, "tableau")).toBe(false));
});
