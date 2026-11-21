/** Règles de la recherche sans base de données : quand proposer une demande, quelle matière deviner, l'extrait. */
import { folded } from "@/lib/content-utils";
import type { Category } from "@/lib/db/schema";

export const REQUEST_MIN_CHARS = 4;
export const REQUEST_MAX_RESULTS = 2;
export const SEARCH_TYPES = ["cours", "fiche", "td", "partiel"] as const satisfies readonly Category[];
export type SearchType = (typeof SEARCH_TYPES)[number];
// Bornes de ts_headline : des caractères de contrôle, que le texte d'un cours ne contient jamais
export const MARK_START = "\u0001";
export const MARK_END = "\u0002";

/** Une requête vague (« td ») ne devient pas une demande ; une recherche qui trouve déjà assez non plus. */
export function shouldProposeRequest(query: string, results: number) {
  return query.trim().replace(/\s+/g, " ").length >= REQUEST_MIN_CHARS && results <= REQUEST_MAX_RESULTS;
}

const words = (text: string) => folded(text).split(/[^a-z0-9]+/).filter(Boolean);

/**
 * La matière d'une demande, d'après le texte : le nom court (« HPE ») ou un mot du nom (« microéconomie »),
 * sinon la matière d'où l'on cherche, sinon rien.
 */
export function guessSubject(query: string, subjects: { id: number; name: string; shortName: string }[], fallback?: number | null): number | null {
  const typed = words(query);
  if (typed.length) {
    let best: { id: number; score: number } | null = null;
    for (const subject of subjects) {
      const short = folded(subject.shortName).replace(/[^a-z0-9]/g, "");
      const named = words(subject.name).filter((w) => w.length >= 4);
      let score = 0;
      if (short.length >= 2 && typed.includes(short)) score = 3;
      else if (named.length && named.every((w) => typed.includes(w))) score = 2;
      // « micro » pour « Microéconomie » : un début de mot d'au moins 5 lettres suffit
      else if (typed.some((t) => t.length >= 5 && named.some((w) => w.startsWith(t) || t.startsWith(w)))) score = 1;
      if (score && (!best || score > best.score)) best = { id: subject.id, score };
    }
    if (best) return best.id;
  }
  return fallback && subjects.some((s) => s.id === fallback) ? fallback : null;
}

/** Le Markdown d'un extrait se lit mal : on garde le texte. */
export function cleanSnippet(text: string) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_`|~]+/g, " ")
    .replace(/(^|\s)>+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Découpe un extrait de ts_headline en morceaux surlignés ou non, sans jamais produire de HTML. */
export function headlineParts(text: string): { text: string; mark: boolean }[] {
  const parts: { text: string; mark: boolean }[] = [];
  let mark = false;
  let buffer = "";
  for (const char of text) {
    if (char === MARK_START || char === MARK_END) {
      if (buffer) parts.push({ text: buffer, mark });
      buffer = "";
      mark = char === MARK_START;
    } else buffer += char;
  }
  if (buffer) parts.push({ text: buffer, mark });
  return parts
    .map((p) => ({ ...p, text: p.text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[#*_`|~]+/g, " ").replace(/(^|\s)>+/g, " ").replace(/\s+/g, " ") }))
    .filter((p) => p.text.trim());
}

export const searchType = (raw: string | null | undefined): SearchType | null => (SEARCH_TYPES as readonly string[]).includes(raw ?? "") ? raw as SearchType : null;
