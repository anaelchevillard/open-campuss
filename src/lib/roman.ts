const NUMERALS: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];

/** 1 → I, 4 → IV, 12 → XII. Hors de 1…3999 (ou non entier) : chaîne vide. */
export function toRoman(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 3999) return "";
  let rest = value;
  let out = "";
  for (const [n, letters] of NUMERALS) while (rest >= n) { out += letters; rest -= n; }
  return out;
}

/** Libellé de la pastille de chapitre d'une carte : « CHAP. II ». */
export const chapterLabel = (chapter: number | null | undefined) => (chapter ? (toRoman(chapter) ? `CHAP. ${toRoman(chapter)}` : "") : "");
