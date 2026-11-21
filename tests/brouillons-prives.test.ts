import { describe, expect, test } from "vitest";
import { canEditCourse, canModerate, canReadDocument } from "../src/lib/access";

const delegate = { id: "d", role: "delegate" as const, programId: 1 };
const admin = { id: "a", role: "admin" as const, programId: 1 };
const base = { kind: "editor", programId: 1, createdBy: "auteur", hiddenByReports: false, published: false, reviewRequested: false, reviewNote: null as string | null };

describe("brouillons privés", () => {
  test("le délégué ne lit, ne modifie ni ne modère un brouillon jamais soumis", () => {
    expect(canReadDocument(delegate, base)).toBe(false);
    expect(canEditCourse(delegate, base)).toBe(false);
    expect(canModerate(delegate, base)).toBe(false);
  });

  test("le délégué modère un cours soumis, renvoyé avec un mot ou publié dans sa licence", () => {
    for (const doc of [{ ...base, reviewRequested: true }, { ...base, reviewNote: "À reprendre" }, { ...base, published: true }]) {
      expect(canReadDocument(delegate, doc)).toBe(true);
      expect(canModerate(delegate, doc)).toBe(true);
    }
  });

  test("rien hors de sa licence, et l'auteur garde son brouillon", () => {
    expect(canModerate(delegate, { ...base, reviewRequested: true, programId: 2 })).toBe(false);
    expect(canReadDocument({ id: "auteur", role: "member" as const, programId: 1 }, base)).toBe(true);
    expect(canModerate(admin, base)).toBe(true);
  });

  test("hors document (matière, demande), la règle de licence reste seule", () => {
    expect(canModerate(delegate, { programId: 1 })).toBe(true);
  });
});
