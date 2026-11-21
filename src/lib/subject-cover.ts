/** Couverture de remplacement d'une carte de cours sans image : la teinte et le sigle de la matière (règles pures, testées). */

/** Teintes OKLCH espacées, choisies pour rester lisibles en clair comme en sombre ; 15 est le bordeaux de la marque. */
export const COVER_HUES = [15, 55, 95, 150, 195, 235, 275, 320] as const;

const hash = (value: string) => [...value].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

/** Une matière garde toujours la même teinte, d'une page à l'autre ; sans matière, le cours décide. */
export function coverHue(subjectId: number | null | undefined, fallback: string): number {
  const index = subjectId ? subjectId : Math.abs(hash(fallback));
  return COVER_HUES[index % COVER_HUES.length];
}

const SMALL_WORDS = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "et", "à", "a", "au", "aux", "en", "pour", "sur", "un", "une"]);
const PICTOGRAPHS = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

/**
 * Le sigle affiché : le nom court de la matière s'il existe (« HPE », « Constit »), sinon les initiales
 * des mots qui comptent (« Histoire de la pensée économique » → « HPE »). Jamais d'emoji, 8 caractères au plus.
 */
export function subjectSigle(short: string | null | undefined, name?: string | null): string {
  const clean = (short ?? "").replace(PICTOGRAPHS, "").trim();
  // Un nom court qui est en fait un nom long (« Droit constitutionnel ») devient ses initiales
  if (clean && (clean.length <= 8 || !/\s/.test(clean))) return clean.slice(0, 8);
  const words = (clean || name || "").replace(PICTOGRAPHS, " ").split(/[\s'’\-–,:;.()]+/u).filter((w) => w && !SMALL_WORDS.has(w.toLowerCase()));
  return words.slice(0, 4).map((w) => w[0]!.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleUpperCase("fr")).join("");
}
