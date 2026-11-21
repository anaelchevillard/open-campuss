import { CATEGORY_TAGS } from "@/lib/db/categories";

/**
 * Ce qui est publié se compte et se nomme par type. Une fiche ou un partiel n'est jamais « un cours » :
 * « 3 CM · 2 TD · 1 fiche » plutôt que « 6 cours ». Fonctions pures, partagées par l'accueil, Matières, les profils,
 * l'administration et les mails.
 */
export type Category = keyof typeof CATEGORY_TAGS;
export type CategoryCounts = Partial<Record<Category, number>>;

/** L'ordre de lecture : les cours (CM puis TD), puis ce qui sert à réviser, puis les projets. */
export const CATEGORY_ORDER: readonly Category[] = ["cours", "td", "fiche", "partiel", "projet"];

// Singulier, pluriel. « CM » et « TD » ne prennent pas de s.
const WORDS: Record<Category, readonly [string, string]> = {
  cours: ["CM", "CM"], td: ["TD", "TD"], fiche: ["fiche", "fiches"], partiel: ["partiel", "partiels"], projet: ["projet", "projets"],
};

export const isCategory = (value: unknown): value is Category => typeof value === "string" && value in WORDS;

/** « 1 fiche », « 3 CM », « 2 partiels ». */
export function categoryCount(category: Category, n: number) {
  const [one, many] = WORDS[category];
  return `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`;
}

/** Les comptes d'une liste de documents (ou de lignes déjà groupées, avec `n`). */
export function countByCategory(rows: readonly { category: string; n?: number }[]): CategoryCounts {
  const counts: CategoryCounts = {};
  for (const row of rows) if (isCategory(row.category)) counts[row.category] = (counts[row.category] ?? 0) + (row.n ?? 1);
  return counts;
}

/** Les comptes par clé (matière, licence…) de lignes groupées par clé et par type. */
export function countsByKey<K>(rows: readonly { key: K; category: string; n: number }[]): Map<K, CategoryCounts> {
  const out = new Map<K, CategoryCounts>();
  for (const row of rows) {
    if (!isCategory(row.category)) continue;
    const counts = { ...(out.get(row.key) ?? {}) };
    counts[row.category] = (counts[row.category] ?? 0) + row.n;
    out.set(row.key, counts);
  }
  return out;
}

export const totalOf = (counts: CategoryCounts) => CATEGORY_ORDER.reduce((sum, c) => sum + (counts[c] ?? 0), 0);

/** Les types présents, dans l'ordre de lecture. */
export const presentCategories = (counts: CategoryCounts) => CATEGORY_ORDER.filter((c) => (counts[c] ?? 0) > 0);

/**
 * « 3 CM · 2 TD · 1 fiche » ; rien de publié : `empty` (« Rien de publié » par défaut).
 * `prefix` sert aux nouveautés (« +2 CM »), `separator` aux phrases (« 2 CM, 1 fiche »).
 */
export function categoryCountsLabel(counts: CategoryCounts, { empty = "Rien de publié", prefix = "", separator = " · " }: { empty?: string; prefix?: string; separator?: string } = {}) {
  const parts = presentCategories(counts).map((c) => `${prefix}${categoryCount(c, counts[c]!)}`);
  return parts.length ? parts.join(separator) : empty;
}

/**
 * Le type montré d'office sur la page d'une matière : celui de l'adresse s'il y figure, sinon les CM,
 * sinon le premier type présent. Null seulement si la matière est vide.
 */
export function defaultCategory(counts: CategoryCounts): Category | null {
  return (counts.cours ?? 0) > 0 ? "cours" : presentCategories(counts)[0] ?? null;
}

export function selectedCategory(wanted: string | null | undefined, counts: CategoryCounts): Category | null {
  return isCategory(wanted) && (counts[wanted] ?? 0) > 0 ? wanted : defaultCategory(counts);
}

/** Le libellé d'un compte de publications : « CM publiés », « fiche publiée »… (accord en genre et en nombre). */
export function publishedWord(category: Category, n: number) {
  const [one, many] = WORDS[category];
  const feminine = category === "fiche";
  return `${n > 1 ? many : one} ${feminine ? (n > 1 ? "publiées" : "publiée") : n > 1 ? "publiés" : "publié"}`;
}
