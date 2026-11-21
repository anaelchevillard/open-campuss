import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { askedDetails, missingDetails, type DetailState } from "@/lib/doc-details";

// Dans la fenêtre d'envoi, le dernier champ manquant disparaissait dès sa première lettre.
// Cause : chaque champ était rendu selon missingDetails(champs en cours), recalculé à chaque frappe ; rempli d'un
// caractère, il n'était plus « manquant » et le champ se démontait. Les champs affichés sont désormais fixés à l'ouverture.

const draft: DetailState = { title: "Les physiocrates", subjectId: 1, rights: "own_notes", category: "cours", chapter: 2, semester: 1, teacherName: "" };

describe("fenêtre d'envoi : champs demandés", () => {
  it("un champ reste affiché après sa première lettre", () => {
    const atOpening = missingDetails(draft, { teacher: false });
    expect(atOpening).toEqual(["teacher"]);
    const asked = askedDetails([], atOpening);
    // Première frappe : la règle ne le compte plus comme manquant…
    const typed = { ...draft, teacherName: "M" };
    expect(missingDetails(typed, { teacher: false })).toEqual([]);
    // …mais la fenêtre le garde jusqu'à l'envoi
    expect(askedDetails(asked, missingDetails(typed, { teacher: false }))).toEqual(["teacher"]);
  });

  it("ajoute ce que le serveur signale encore à l'envoi, sans doublon", () => {
    expect(askedDetails(["teacher"], ["chapter", "teacher"])).toEqual(["teacher", "chapter"]);
  });

  it("l'éditeur affiche les champs de la fenêtre selon cette liste figée, pas selon la frappe", () => {
    const source = readFileSync("src/components/editor/doc-editor-inner.tsx", "utf8");
    expect(source).toMatch(/const needsTeacher = asked\.includes\("teacher"\)/);
    expect(source).toMatch(/const needsChapter = asked\.includes\("chapter"\)/);
    expect(source).toMatch(/const needsTitle = asked\.includes\("title"\)/);
    expect(source).not.toMatch(/const needs\w+ = needed\.includes/);
    expect(source).toMatch(/setAsked\(missingOf\(latest\.current\)\)/);
  });
});
