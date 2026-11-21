import "server-only";
import { eq } from "drizzle-orm";
import { askAiJson } from "./ai/client";
import { DATA_RULE, delimit } from "./ai/prompt-data";
import { reserveAi } from "./ai-quota-server";
import { db, schema } from "./db";
import { CATEGORIES } from "./db/categories";
import type { Document, User } from "./db/schema";
import { checkSuggestion, documentExcerpt, SUGGESTION_JSON_SCHEMA, type DocSuggestion } from "./doc-suggestion";
import { env } from "./env";

const MIN_TEXT = 40;

const SYSTEM = `Tu aides un étudiant à classer un document de cours.

Réponds uniquement avec un objet JSON : {"title":"...","subject":1,"category":"cours","chapter":null}
- title : un titre court et précis pour ce document, en français, sans nom de personne, ou null.
- subject : l'identifiant d'une matière de la liste <matieres>, ou null si aucune ne convient clairement.
- category : une valeur parmi ${Object.entries(CATEGORIES).map(([key, label]) => `${key} (${label})`).join(", ")}.
- chapter : le numéro du chapitre s'il est indiqué, sinon null.

${DATA_RULE}`;

type Subject = { id: number; name: string; level: number };

const userMessage = (subjects: Subject[], filename: string, text: string) => [
  delimit("matieres", JSON.stringify(subjects.map((s) => ({ id: s.id, name: s.name, annee: `L${s.level}` })))),
  delimit("fichier", filename.slice(0, 200)),
  delimit("cours", documentExcerpt(text)),
].join("\n\n");

/** Jamais bloquant : sans clé, sans quota, en pause ou en cas d'échec, l'étudiant garde simplement le nom du fichier. */
export async function suggestDetails(user: Pick<User, "id" | "role">, doc: Pick<Document, "programId" | "bodyText">, filename: string): Promise<DocSuggestion | null> {
  if (!env.aiApiKey || doc.bodyText.trim().length < MIN_TEXT) return null;
  const reservation = await reserveAi(user, "suggest");
  if (!reservation.ok) return null;
  try {
    const subjects = await db.select({ id: schema.subjects.id, name: schema.subjects.name, level: schema.subjects.level }).from(schema.subjects).where(eq(schema.subjects.programId, doc.programId));
    const ids = subjects.map((s) => s.id);
    const { data } = await askAiJson("suggest", { system: SYSTEM, user: userMessage(subjects, filename, doc.bodyText) }, {
      name: "classement", schema: SUGGESTION_JSON_SCHEMA, parse: { parse: (value: unknown) => checkSuggestion(value, ids) },
    });
    return data;
  } catch (error) {
    console.warn("proposition :", (error as Error).message);
    await reservation.release();
    return null;
  }
}
