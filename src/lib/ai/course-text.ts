/**
 * Texte d'un cours prêt à partir chez le fournisseur d'IA : compacté, puis échantillonné partie par partie
 * s'il reste trop long, pour que la fin du cours compte autant que son début.
 */

/** Taille maximale du cours envoyé pour un quiz ou des fiches, en caractères (environ 15 000 jetons). */
export const COURSE_CHAR_BUDGET = 60_000;

const MIN_REPEATS = 3;
const MAX_BOILERPLATE_LENGTH = 120;
const MIN_TITLED_PARTS = 4;
const UNTITLED_PARTS = 12;
const MAX_TITLE_LENGTH = 100;
const CUT = " […]";

const PAGE_NUMBER = /^(?:page\s*|p\.\s*)?\d{1,4}(?:\s*(?:\/|sur)\s*\d{1,4})?$/i;
// Un en-tête répété ne diffère que par son numéro de page final : « Université… page 3 », « Économie – p. 4/12 »
const boilerplateKey = (line: string) => PAGE_NUMBER.test(line) ? "#page" : line.toLowerCase().replace(/\s*[-–—|·,]?\s*(?:page|p\.)\s*\d{1,4}(?:\s*(?:\/|sur)\s*\d{1,4})?$/i, "");
const isHeading = (line: string) => /^#{1,6}\s/.test(line)
  || (line.length <= MAX_TITLE_LENGTH && /^(?:chapitre|partie|section|annexe)\b|^(?:[IVX]+|\d+(?:\.\d+)*)[.)]?\s+\p{Lu}/iu.test(line));

/** Espaces, lignes vides, en-têtes et pieds de page répétés (numéro de page compris) : rien de cela n'apprend quoi que ce soit au modèle. */
export function compactText(text: string) {
  const lines = text.replace(/\r\n?/g, "\n").replace(/[\t\f\v   ]+/g, " ").split("\n").map((l) => l.trim()).filter(Boolean);
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(boilerplateKey(line), (counts.get(boilerplateKey(line)) ?? 0) + 1);
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const line of lines) {
    const key = boilerplateKey(line);
    const repeated = (counts.get(key) ?? 0) >= MIN_REPEATS && line.length <= MAX_BOILERPLATE_LENGTH && !isHeading(line);
    if (repeated) {
      // Un numéro de page seul ne sert jamais ; un en-tête garde sa première occurrence, qui porte souvent le titre du cours
      if (seen.has(key) || key === "#page") continue;
      seen.add(key);
    }
    if (kept.at(-1) === line) continue;
    kept.push(line);
  }
  return kept.join("\n");
}

type Part = { title: string; body: string };

function splitParts(text: string): Part[] {
  const parts: Part[] = [];
  let current: Part = { title: "", body: "" };
  for (const line of text.split("\n")) {
    if (isHeading(line)) {
      if (current.title || current.body) parts.push(current);
      current = { title: line, body: "" };
    } else current.body += (current.body ? "\n" : "") + line;
  }
  parts.push(current);
  if (parts.filter((p) => p.title).length >= MIN_TITLED_PARTS) return parts;
  // Sans titres, des tranches égales du texte jouent le rôle des parties
  const size = Math.ceil(text.length / UNTITLED_PARTS);
  return Array.from({ length: UNTITLED_PARTS }, (_, i) => ({ title: "", body: text.slice(i * size, (i + 1) * size) })).filter((p) => p.body);
}

/** Début d'une partie, coupé de préférence en fin de ligne ou de phrase. */
function excerpt(body: string, size: number) {
  if (body.length <= size) return body;
  const head = body.slice(0, Math.max(0, size - CUT.length));
  const end = Math.max(head.lastIndexOf("\n"), head.lastIndexOf(". ") + 1);
  return `${end > head.length * 0.6 ? head.slice(0, end) : head}${CUT}`;
}

/** Garde tous les titres et un extrait de chaque partie ; les parties courtes cèdent leur reste aux longues. */
export function sampleParts(text: string, budget = COURSE_CHAR_BUDGET) {
  if (text.length <= budget) return text;
  const parts = splitParts(text);
  const titles = parts.reduce((sum, p) => sum + (p.title ? p.title.length + 1 : 0), 0) + parts.length;
  let left = Math.max(0, budget - titles);
  const shares = new Map<Part, number>();
  const bySize = [...parts].sort((a, b) => a.body.length - b.body.length);
  bySize.forEach((part, i) => {
    const share = Math.min(part.body.length, Math.floor(left / (bySize.length - i)));
    shares.set(part, share);
    left -= share;
  });
  const out = parts.map((p) => [p.title, excerpt(p.body, shares.get(p) ?? 0)].filter(Boolean).join("\n")).filter(Boolean).join("\n");
  // Dernier filet, si les titres seuls dépassaient le budget
  return out.slice(0, budget);
}

export const courseForPrompt = (text: string, budget = COURSE_CHAR_BUDGET) => sampleParts(compactText(text), budget);

/** Texte du cours et de ses fichiers, séparés par une ligne : les titres restent en début de ligne. */
export const joinCourse = (body: string | null | undefined, files: (string | null)[]) => [body ?? "", ...files.map((f) => f ?? "")].map((t) => t.trim()).filter(Boolean).join("\n\n");
