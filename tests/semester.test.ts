import { describe, expect, it } from "vitest";
import { absoluteSemester, academicYearOf, chosenParity, defaultTerms, parityAt, parityOfSemester, pickParity, semesterLabel } from "@/lib/semester-rules";

const d = (s: string) => new Date(`${s}T12:00:00`);

describe("semestres", () => {
  it("l'année universitaire bascule le 15 août", () => {
    expect(academicYearOf(d("2026-08-14"))).toBe("2025-2026");
    expect(academicYearOf(d("2026-08-15"))).toBe("2026-2027");
    expect(academicYearOf(d("2027-01-20"))).toBe("2026-2027");
  });
  it("calendrier par défaut : S1 du 15 août au 14 janvier, S2 ensuite", () => {
    const terms = defaultTerms(d("2026-11-03"));
    expect(terms).toEqual({ academicYear: "2026-2027", s1: "2026-08-15", s2: "2027-01-15" });
    expect(parityAt(d("2026-11-03"), terms)).toBe(1);
    expect(parityAt(d("2027-01-14"), terms)).toBe(1);
    expect(parityAt(d("2027-01-15"), terms)).toBe(2);
    expect(parityAt(d("2027-06-01"), terms)).toBe(2);
  });
  it("semestre absolu et libellé", () => {
    expect(absoluteSemester(1, 1)).toBe(1);
    expect(absoluteSemester(2, 2)).toBe(4);
    expect(absoluteSemester(3, 1)).toBe(5);
    expect(parityOfSemester(5)).toBe(1);
    expect(parityOfSemester(4)).toBe(2);
    expect(semesterLabel(2, 1)).toBe("L2 · S3");
  });
  it("un partiel dans les 21 jours impose son semestre", () => {
    const terms = defaultTerms(d("2027-01-10"));
    expect(pickParity(d("2027-01-16"), terms, { at: d("2027-01-25"), parity: 1 })).toBe(1);
    expect(pickParity(d("2027-01-16"), terms, { at: d("2027-03-01"), parity: 1 })).toBe(2);
    expect(pickParity(d("2027-01-16"), terms, null)).toBe(2);
  });
  it("l'URL puis le cookie, sinon le semestre courant", () => {
    expect(chosenParity("2", "1", 1)).toBe(2);
    expect(chosenParity(undefined, "2", 1)).toBe(2);
    expect(chosenParity(undefined, undefined, 1)).toBe(1);
    expect(chosenParity("x", undefined, 2)).toBe(2);
  });
});
