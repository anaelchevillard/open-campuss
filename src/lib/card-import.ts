/**
 * Import de fiches : logique pure, sans base ni navigateur, testée dans tests/fiches-import.test.ts.
 * Le texte importé est une donnée : jamais interprété comme du HTML (le HTML d'Anki est réduit à du texte),
 * puis affiché par CardText (Markdown restreint, formules, sans HTML).
 *
 * Formats :
 * - CSV / TSV : deux colonnes (recto, verso), séparateur détecté (tabulation, point-virgule, virgule), guillemets RFC 4180,
 *   ligne d'en-tête reconnue et sautée (recto/verso, question/réponse, front/back, terme/définition).
 * - Anki, « Notes in Plain Text » (.txt) : en-têtes `#separator:`, `#html:`, `#guid column:`, `#notetype column:`,
 *   `#deck column:`, `#tags column:` ; HTML ramené à du texte (gras, italique, listes, retours à la ligne gardés).
 * - Quizlet (Exporter) : séparateur terme/définition et séparateur de fiches réglables (tabulation, virgule ou autre ;
 *   retour à la ligne, point-virgule ou autre). Pas de guillemets chez Quizlet.
 * - JSON : `{ "cards": [{ "front": "…", "back": "…" }] }` ou directement le tableau ; alias acceptés :
 *   recto/verso, question/answer, question/reponse, term/definition.
 * - .apkg (Anki) : refusé avec une explication (voir APKG_EXPLANATION).
 */

import { z } from "zod";

export const IMPORT_MAX_CARDS = 1000;
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const FRONT_MAX = 1000;
export const BACK_MAX = 2000;

export type ImportFormat = "csv" | "anki" | "quizlet" | "json";
export type ImportCard = { front: string; back: string };
export type ImportResult = {
  format: ImportFormat;
  cards: ImportCard[];
  /** Lignes sans recto ou sans verso. */
  empty: number;
  /** Fiches dont un côté dépasse la longueur permise (1 000 caractères au recto, 2 000 au verso). */
  tooLong: number;
  /** Plus de 1 000 fiches : seules les premières sont gardées. */
  truncated: boolean;
  /** Fichier illisible dans ce format. */
  error?: string;
  delimiter?: string;
};

export const APKG_EXPLANATION = "Les paquets .apkg d’Anki ne sont pas lus directement : c’est une base de données compressée qui demanderait un moteur SQLite dans Campuss. Dans Anki, fais Fichier › Exporter › « Notes in Plain Text (.txt) », puis importe ce fichier ici.";

// Caractères de contrôle (sauf tabulation et retour à la ligne) : rien d'invisible ne passe dans une fiche
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export const cleanField = (value: string) => value.replace(/\r\n?/g, "\n").replace(CONTROL, "").replace(/[ \t]+\n/g, "\n").trim();

export function byteLength(text: string) {
  return new TextEncoder().encode(text).length;
}

/** Un fichier .apkg (ou tout zip) : signature « PK\x03\x04 ». */
export function isZip(bytes: Uint8Array) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** Découpe en enregistrements et champs, guillemets doubles à la RFC 4180 (« "" » pour un guillemet). */
export function splitRecords(text: string, delimiter: string, quotes = true): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let atStart = true;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
      continue;
    }
    if (quotes && c === '"' && atStart) { quoted = true; atStart = false; continue; }
    if (text.startsWith(delimiter, i)) { row.push(field); field = ""; atStart = true; i += delimiter.length - 1; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = ""; atStart = true;
      continue;
    }
    field += c;
    atStart = false;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const CANDIDATES = ["\t", ";", ","] as const;

/** Le séparateur le plus régulier sur les premières lignes : tabulation, puis point-virgule, puis virgule. */
export function detectDelimiter(text: string): (typeof CANDIDATES)[number] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith("#")).slice(0, 30);
  let best: (typeof CANDIDATES)[number] = "\t";
  let bestScore = -1;
  for (const candidate of CANDIDATES) {
    const rows = splitRecords(lines.join("\n"), candidate);
    const withTwo = rows.filter((r) => r.length >= 2).length;
    const score = rows.length ? withTwo / rows.length : 0;
    // À égalité, le premier de la liste gagne : une virgule dans le texte ne l'emporte pas sur une tabulation
    if (score > bestScore) { best = candidate; bestScore = score; }
  }
  return bestScore > 0 ? best : "\t";
}

const HEADERS = new Set(["front", "back", "recto", "verso", "question", "reponse", "réponse", "answer", "terme", "term", "definition", "définition"]);
const isHeader = (row: string[]) => row.length >= 2 && HEADERS.has(row[0].trim().toLowerCase()) && HEADERS.has(row[1].trim().toLowerCase());

/** Les paires (recto, verso) passent par les mêmes règles : vide, trop long, plus de 1 000. */
export function finalize(format: ImportFormat, pairs: [string, string][], extra: Partial<ImportResult> = {}): ImportResult {
  const cards: ImportCard[] = [];
  let empty = 0;
  let tooLong = 0;
  let truncated = false;
  for (const [rawFront, rawBack] of pairs) {
    const front = cleanField(rawFront ?? "");
    const back = cleanField(rawBack ?? "");
    if (!front || !back) { empty++; continue; }
    if (front.length > FRONT_MAX || back.length > BACK_MAX) { tooLong++; continue; }
    if (cards.length >= IMPORT_MAX_CARDS) { truncated = true; break; }
    cards.push({ front, back });
  }
  return { format, cards, empty, tooLong, truncated, ...extra };
}

export function parseCsv(text: string, delimiter?: string): ImportResult {
  const sep = delimiter || detectDelimiter(text);
  const rows = splitRecords(text, sep).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length && isHeader(rows[0])) rows.shift();
  return finalize("csv", rows.map((row) => [row[0] ?? "", row[1] ?? ""]), { delimiter: sep });
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", eacute: "é", Eacute: "É", egrave: "è", Egrave: "È", ecirc: "ê", euml: "ë",
  agrave: "à", Agrave: "À", acirc: "â", ccedil: "ç", Ccedil: "Ç", icirc: "î", iuml: "ï", ocirc: "ô", ugrave: "ù", ucirc: "û", uuml: "ü",
  oelig: "œ", laquo: "«", raquo: "»", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", times: "×", deg: "°",
};

export function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[name] ?? ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/**
 * Le HTML d'une note Anki ramené à du texte de fiche : retours à la ligne, gras, italique et listes gardés en Markdown,
 * tout le reste (scripts, styles, images, sons, attributs) retiré. Le résultat n'est jamais rendu comme du HTML.
 */
export function htmlToCardText(html: string) {
  return decodeEntities(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/\[sound:[^\]]*\]/gi, "")
      .replace(/\{\{c\d+::([\s\S]*?)(?:::[\s\S]*?)?\}\}/g, "$1")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(/<\/(div|p|li|ul|ol|h[1-6])\s*>/gi, "\n")
      .replace(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, (_, _tag, inner: string) => (inner.trim() ? `**${inner.trim()}**` : inner))
      .replace(/<(i|em)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, (_, _tag, inner: string) => (inner.trim() ? `*${inner.trim()}*` : inner))
      .replace(/<[^>]*>/g, ""),
  ).replace(/\n{3,}/g, "\n\n");
}

const ANKI_SEPARATORS: Record<string, string> = { tab: "\t", comma: ",", semicolon: ";", pipe: "|", space: " ", colon: ":" };

/** Export « Notes in Plain Text » d'Anki : en-têtes `#clé:valeur`, puis une note par ligne. */
export function parseAnkiText(text: string): ImportResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  let separator = "\t";
  let html = true;
  const skip = new Set<number>();
  let body = 0;
  for (; body < lines.length && lines[body].startsWith("#"); body++) {
    const match = /^#([a-z ]+):(.*)$/i.exec(lines[body].trim());
    if (!match) continue;
    const [key, value] = [match[1].trim().toLowerCase(), match[2].trim()];
    if (key === "separator") separator = ANKI_SEPARATORS[value.toLowerCase()] ?? (value.length === 1 ? value : separator);
    else if (key === "html") html = value.toLowerCase() === "true";
    else if (/^(guid|notetype|deck|tags) column$/.test(key)) { const n = Number(value); if (Number.isInteger(n) && n > 0) skip.add(n - 1); }
  }
  const rows = splitRecords(lines.slice(body).join("\n"), separator).filter((row) => row.some((cell) => cell.trim()));
  const pairs = rows.map((row) => {
    const fields = row.filter((_, index) => !skip.has(index));
    const clean = (value = "") => (html ? htmlToCardText(value) : value);
    return [clean(fields[0]), clean(fields[1])] as [string, string];
  });
  return finalize("anki", pairs, { delimiter: separator });
}

export type QuizletOptions = { term: string; card: string };
export const QUIZLET_DEFAULT: QuizletOptions = { term: "\t", card: "\n" };

/** Export Quizlet : un séparateur entre terme et définition, un autre entre les fiches ; coupe au premier séparateur. */
export function parseQuizlet(text: string, options: QuizletOptions = QUIZLET_DEFAULT): ImportResult {
  const term = options.term || "\t";
  const card = options.card || "\n";
  const normalized = text.replace(/\r\n?/g, "\n");
  const pairs = normalized.split(card).filter((chunk) => chunk.trim()).map((chunk) => {
    const at = chunk.indexOf(term);
    return (at < 0 ? [chunk, ""] : [chunk.slice(0, at), chunk.slice(at + term.length)]) as [string, string];
  });
  return finalize("quizlet", pairs);
}

const FRONT_KEYS = ["front", "recto", "question", "term"];
const BACK_KEYS = ["back", "verso", "answer", "reponse", "réponse", "definition"];
const pickText = (item: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) if (typeof item[key] === "string") return item[key] as string;
  return "";
};

/** JSON documenté : `{ "cards": [{ "front": "…", "back": "…" }] }` ou le tableau seul. */
export function parseJson(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return finalize("json", [], { error: "Ce fichier n’est pas du JSON valide." });
  }
  const list = Array.isArray(data) ? data : data && typeof data === "object" && Array.isArray((data as { cards?: unknown }).cards) ? (data as { cards: unknown[] }).cards : null;
  if (!list) return finalize("json", [], { error: "Il faut un tableau « cards » de fiches { front, back }." });
  const pairs = list.map((item) => (item && typeof item === "object" ? [pickText(item as Record<string, unknown>, FRONT_KEYS), pickText(item as Record<string, unknown>, BACK_KEYS)] : ["", ""]) as [string, string]);
  return finalize("json", pairs);
}

/** Le format probable d'un fichier, d'après son nom puis son contenu. */
export function guessFormat(name: string, text: string): ImportFormat {
  const lower = name.toLowerCase();
  const start = text.replace(/^﻿/, "").trimStart();
  if (lower.endsWith(".json") || start.startsWith("{") || start.startsWith("[")) return "json";
  if (/^#(separator|html|notetype|deck|columns|tags|guid)/im.test(start.slice(0, 400))) return "anki";
  return "csv";
}

export function parseImport(text: string, format: ImportFormat, options: { delimiter?: string; quizlet?: QuizletOptions } = {}): ImportResult {
  if (byteLength(text) > IMPORT_MAX_BYTES) return finalize(format, [], { error: "Fichier trop lourd : 2 Mo au plus." });
  if (format === "json") return parseJson(text);
  if (format === "anki") return parseAnkiText(text);
  if (format === "quizlet") return parseQuizlet(text, options.quizlet);
  return parseCsv(text, options.delimiter);
}

/** Ce que le serveur accepte (validé par zod côté serveur, jamais seulement dans le navigateur). */
const sideSchema = (max: number) => z.string().transform(cleanField).pipe(z.string().min(1).max(max));

export const importPayload = z.object({
  scope: z.union([z.literal("libre"), z.uuid()]),
  cards: z.array(z.object({ front: sideSchema(FRONT_MAX), back: sideSchema(BACK_MAX) }).strict()).min(1).max(IMPORT_MAX_CARDS),
}).strict().refine((data) => data.cards.reduce((sum, card) => sum + byteLength(card.front) + byteLength(card.back), 0) <= IMPORT_MAX_BYTES, { message: "trop lourd" });

/** Les fiches déjà présentes (même recto et même verso) ne sont pas importées deux fois, ni en double dans l'import. */
export function withoutDuplicates(cards: ImportCard[], existing: Iterable<ImportCard>) {
  const seen = new Set([...existing].map((card) => `${card.front}\u0000${card.back}`));
  return cards.filter((card) => {
    const key = `${card.front}\u0000${card.back}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
