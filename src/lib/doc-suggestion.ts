import { z } from "zod";
import { compactText } from "./ai/course-text";
import { CATEGORIES } from "./db/categories";
import type { Category } from "./db/schema";

export type DocSuggestion = { title: string | null; subject: number | null; category: Category; chapter: number | null };

export const suggestionShape = z.object({
  title: z.string().max(400).nullable(),
  subject: z.number().int().nullable(),
  category: z.enum(Object.keys(CATEGORIES) as [Category, ...Category[]]),
  chapter: z.number().int().min(1).max(999).nullable(),
}).strict();

const MAX_TITLE = 120;

/** Un titre sert à nommer, pas à faire cliquer ni à glisser du balisage : au moindre doute, on garde le nom du fichier. */
function cleanTitle(raw: string | null) {
  const title = (raw ?? "").replace(/[\p{C}\s]+/gu, " ").trim();
  if (title.length < 3 || title.length > MAX_TITLE) return null;
  if (/[<>{}`]|:\/\/|www\.|\S+@\S+|\]\(/i.test(title)) return null;
  return title;
}

/** Schéma de sortie demandé au modèle (response_format) ; la validation reste celle de suggestionShape. */
export const SUGGESTION_JSON_SCHEMA = {
  type: "object", additionalProperties: false, required: ["title", "subject", "category", "chapter"],
  properties: {
    title: { type: ["string", "null"] },
    subject: { type: ["integer", "null"] },
    category: { type: "string", enum: Object.keys(CATEGORIES) },
    chapter: { type: ["integer", "null"], minimum: 1, maximum: 999 },
  },
};

/** Ce que le modèle propose, filtré : la matière ne peut venir que de la liste, le titre est nettoyé. */
export function checkSuggestion(value: unknown, subjectIds: readonly number[]): DocSuggestion {
  const parsed = suggestionShape.parse(value);
  return { title: cleanTitle(parsed.title), subject: parsed.subject !== null && subjectIds.includes(parsed.subject) ? parsed.subject : null, category: parsed.category, chapter: parsed.chapter };
}

/**
 * Le texte d'un fichier peut contenir n'importe quelle consigne, et le modèle peut l'avoir suivie :
 * rien de ce qu'il répond n'est cru sans vérification, et la matière ne peut venir que de la liste.
 */
export function parseSuggestion(raw: string, subjectIds: readonly number[]): DocSuggestion | null {
  try {
    return checkSuggestion(JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)), subjectIds);
  } catch {
    return null;
  }
}

export const EXCERPT_LENGTH = 6000;

/** Début compacté du fichier : pour classer, le début suffit. La balise <cours> est posée (et protégée) par delimit. */
export const documentExcerpt = (text: string) => compactText(text).slice(0, EXCERPT_LENGTH);
