import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { AiError, askAiJson } from "./ai/client";
import { courseForPrompt, joinCourse } from "./ai/course-text";
import { DATA_RULE, delimit } from "./ai/prompt-data";
import { db, schema } from "./db";
import { env } from "./env";

const { documents, quizzes, docFiles } = schema;
const MIN_TEXT = 500;
const RETRY_LATER_MS = 15 * 60_000;

const shape = z.object({ questions: z.array(z.object({
  question: z.string().min(5).max(500),
  choices: z.array(z.string().min(1).max(300)).min(3).max(5),
  answer: z.number().int().min(0),
  explanation: z.string().max(800),
}).refine((q) => q.answer < q.choices.length)).min(3).max(10) });

/** Change à chaque retouche des consignes : enregistrée avec chaque quiz, elle dit quels quiz régénérer. */
export const PROMPT_VERSION = "quiz/2026-11-20";

const JSON_SCHEMA = {
  type: "object", additionalProperties: false, required: ["questions"],
  properties: {
    questions: { type: "array", minItems: 3, maxItems: 10, items: {
      type: "object", additionalProperties: false, required: ["question", "choices", "answer", "explanation"],
      properties: { question: { type: "string" }, choices: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } }, answer: { type: "integer", minimum: 0 }, explanation: { type: "string" } },
    } },
  },
};

const SYSTEM = `Tu prépares un quiz de révision pour des étudiants en licence, à partir du cours fourni entre les balises <cours>.

Règles :
- Entre 5 et 8 questions à choix multiples, en français, sur les notions importantes, réparties sur tout le cours.
- Une seule bonne réponse, parmi 4 propositions.
- Appuie-toi uniquement sur le cours. N'invente aucun fait. Aucun nom d'étudiant ni coordonnée.
- explanation : une ou deux phrases qui justifient la bonne réponse.
- ${DATA_RULE}
- Réponds uniquement avec du JSON : {"questions":[{"question":"...","choices":["..."],"answer":0,"explanation":"..."}]}, answer étant l'indice de la bonne réponse.`;

let retryAfter = 0;

/** Un quiz par document, généré une seule fois à la publication, puis servi à tous depuis la base. */
export async function runQuizJobs() {
  if (!env.aiApiKey || Date.now() < retryAfter) return;
  const [doc] = await db.select().from(documents).where(and(eq(documents.quizStatus, "pending"), and(eq(documents.published, true), isNull(documents.deletedAt)))).limit(1);
  if (!doc) return;
  const files = await db.select({ text: docFiles.extractedText }).from(docFiles).where(eq(docFiles.documentId, doc.id));
  const text = joinCourse(doc.bodyText, files.map((f) => f.text));
  if (text.length < MIN_TEXT) {
    await db.update(documents).set({ quizStatus: "none" }).where(eq(documents.id, doc.id));
    return;
  }
  try {
    const { data, model } = await askAiJson("quiz", { system: SYSTEM, user: delimit("cours", courseForPrompt(text)) }, { name: "quiz", schema: JSON_SCHEMA, parse: shape });
    await db.insert(quizzes).values({ documentId: doc.id, questions: data.questions, model, promptVersion: PROMPT_VERSION }).onConflictDoNothing();
    await db.update(documents).set({ quizStatus: "ready" }).where(eq(documents.id, doc.id));
  } catch (error) {
    // Affluence, pause ou budget atteint : on réessaie plus tard, sans perdre la demande
    if (error instanceof AiError && error.kind !== "failed") { retryAfter = Date.now() + RETRY_LATER_MS; return; }
    console.warn("quiz :", (error as Error).message);
    await db.update(documents).set({ quizStatus: "failed" }).where(eq(documents.id, doc.id));
  }
}
