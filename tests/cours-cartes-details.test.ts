import { describe, expect, it } from "vitest";
import { COVER_HUES, coverHue, subjectSigle } from "../src/lib/subject-cover";
import { missingDetails } from "../src/lib/doc-details";
import { absoluteSemester, initialTerm, subjectsOfTerm } from "../src/components/subject-picker";

describe("couverture de remplacement des cartes", () => {
  it("une matière garde sa teinte, prise dans la palette", () => {
    expect(coverHue(4, "a")).toBe(coverHue(4, "b"));
    expect(COVER_HUES).toContain(coverHue(null, "11111111-1111-4111-8111-111111111111"));
  });
  it("le sigle vient du nom court, sans emoji", () => {
    expect(subjectSigle("HPE")).toBe("HPE");
    expect(subjectSigle("💭 HPE")).toBe("HPE");
    expect(subjectSigle("Constitutionnel")).toBe("Constitu");
  });
  it("à défaut, les initiales des mots qui comptent", () => {
    expect(subjectSigle(null, "💭 Histoire de la Pensée Économique")).toBe("HPE");
    expect(subjectSigle("Droit constitutionnel")).toBe("DC");
    expect(subjectSigle("", "")).toBe("");
  });
});

describe("détails exigés à l'envoi", () => {
  const complete = { title: "Les physiocrates", subjectId: 3, rights: "own_notes", category: "cours", chapter: 2, semester: 1, teacherName: "M. Martin" };
  it("un cours complet part", () => expect(missingDetails(complete, { teacher: false })).toEqual([]));
  it("un étudiant doit donner semestre, chapitre et enseignant", () => {
    expect(missingDetails({ ...complete, semester: null, chapter: null, teacherName: " " }, { teacher: false })).toEqual(["semester", "chapter", "teacher"]);
  });
  it("un enseignant n'a que titre, matière et origine à donner", () => {
    expect(missingDetails({ ...complete, semester: null, chapter: null, teacherName: null }, { teacher: true })).toEqual([]);
    expect(missingDetails({ ...complete, title: "", subjectId: null, rights: "unknown" }, { teacher: true })).toEqual(["title", "subject", "rights"]);
  });
  it("un partiel ou un projet n'a pas de chapitre", () => {
    expect(missingDetails({ ...complete, category: "partiel", chapter: null }, { teacher: false })).toEqual([]);
    expect(missingDetails({ ...complete, category: "projet", chapter: null }, { teacher: false })).toEqual([]);
  });
  it("sans matière, le semestre n'est pas réclamé en double", () => {
    expect(missingDetails({ ...complete, subjectId: null, semester: null }, { teacher: false })).toEqual(["subject"]);
  });
});

describe("choix de la matière en trois temps", () => {
  const subjects = [
    { id: 1, name: "HPE", level: 1, semester: 1 }, { id: 2, name: "Macro", level: 1, semester: 2 },
    { id: 3, name: "Anglais", level: 1, semester: null }, { id: 4, name: "Finance", level: 2, semester: 3 },
  ];
  it("semestre absolu d'une année", () => {
    expect(absoluteSemester(1, 1)).toBe(1);
    expect(absoluteSemester(2, 2)).toBe(4);
    expect(absoluteSemester(3, 1)).toBe(5);
  });
  it("la matière est filtrée par l'année et le semestre ; une matière annuelle vaut pour les deux", () => {
    expect(subjectsOfTerm(subjects, 1, 2).map((s) => s.id)).toEqual([2, 3]);
    expect(subjectsOfTerm(subjects, 2, 1).map((s) => s.id)).toEqual([4]);
  });
  it("l'année d'un étudiant reste la sienne, même avec une matière gardée d'une autre année", () => {
    expect(initialTerm(subjects, 4, { lockedLevel: 1 })).toEqual({ level: 1, parity: 1 });
    expect(initialTerm(subjects, 2, { lockedLevel: 1 })).toEqual({ level: 1, parity: 2 });
  });
  it("une matière annuelle reprend le semestre du document", () => {
    expect(initialTerm(subjects, 3, { semester: 2 })).toEqual({ level: 1, parity: 2 });
    expect(initialTerm(subjects, null, { level: 2 })).toEqual({ level: 2, parity: 1 });
  });
});
