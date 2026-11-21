import { describe, expect, it } from "vitest";
import { chapterLabel, toRoman } from "@/lib/roman";

describe("chiffres romains des chapitres", () => {
  it("convertit les nombres usuels", () => {
    expect([1, 2, 3, 4, 9, 12, 14, 40, 90, 2026].map(toRoman)).toEqual(["I", "II", "III", "IV", "IX", "XII", "XIV", "XL", "XC", "MMXXVI"]);
  });
  it("refuse ce qui n'est pas un chapitre", () => {
    expect([0, -1, 1.5, 4000, Number.NaN].map(toRoman)).toEqual(["", "", "", "", ""]);
  });
  it("donne la pastille ou rien sans chapitre", () => {
    expect(chapterLabel(2)).toBe("CHAP. II");
    expect(chapterLabel(null)).toBe("");
    expect(chapterLabel(undefined)).toBe("");
    expect(chapterLabel(0)).toBe("");
  });
});
