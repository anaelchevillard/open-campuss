import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";
import { AiError, askAiJson } from "./ai/client";
import { courseForPrompt, joinCourse } from "./ai/course-text";
import { DATA_RULE, delimit } from "./ai/prompt-data";
import { env } from "./env";
import { withoutRemoved } from "./memo-cards";

const { documents, docFiles, memoCardReports, memoDecks } = schema;
const MIN_TEXT = 300;

const shape = z.object({ cards: z.array(z.object({ front: z.string().min(3).max(1000), back: z.string().min(1).max(2000) })).min(3).max(15) });

/** Change à chaque retouche des consignes : enregistrée avec chaque paquet, elle dit quels paquets régénérer. */
export const PROMPT_VERSION = "fiches/2026-11-20";

const JSON_SCHEMA = {
  type: "object", additionalProperties: false, required: ["cards"],
  properties: { cards: { type: "array", minItems: 3, maxItems: 15, items: { type: "object", additionalProperties: false, required: ["front", "back"], properties: { front: { type: "string" }, back: { type: "string" } } } } },
};

const SYSTEM = `Tu prépares des fiches mémo pour des étudiants en licence, à partir du cours fourni entre les balises <cours>.

Règles :
- Entre 6 et 12 fiches mémo, en français, sur les notions importantes : définitions, mécanismes, auteurs, formules. Couvre tout le cours, du début à la fin.
- front : une question courte et précise. back : la réponse, en une à trois phrases.
- Appuie-toi uniquement sur le cours. N'invente aucun fait. Aucun nom d'étudiant ni coordonnée.
- Si des fiches sont listées entre <fiches_retirees>, des modérateurs les ont retirées : ne les réécris pas.
- ${DATA_RULE}
- Réponds uniquement avec du JSON : {"cards":[{"front":"...","back":"..."}]}`;

const running = new Map<string, Promise<{ front: string; back: string }[]>>();

async function writeCards(documentId: string) {
  const [doc] = await db.select({ bodyText: documents.bodyText }).from(documents).where(eq(documents.id, documentId));
  const files = await db.select({ text: docFiles.extractedText }).from(docFiles).where(eq(docFiles.documentId, documentId));
  const text = joinCourse(doc?.bodyText, files.map((f) => f.text));
  if (text.length < MIN_TEXT) throw new MemoError("Ce cours est trop court pour en tirer des fiches mémo.");
  const removed = await db.select({ key: memoCardReports.cardKey, front: memoCardReports.front }).from(memoCardReports).where(and(eq(memoCardReports.documentId, documentId), eq(memoCardReports.status, "removed")));
  const avoid = removed.length ? `\n\n${delimit("fiches_retirees", removed.slice(0, 50).map((r) => `- ${r.front}`).join("\n"))}` : "";
  let parsed: z.infer<typeof shape>;
  let model: string;
  try {
    ({ data: parsed, model } = await askAiJson("memo", { system: SYSTEM, user: `${delimit("cours", courseForPrompt(text))}${avoid}` }, { name: "fiches", schema: JSON_SCHEMA, parse: shape }));
  } catch (error) {
    // Pause, affluence ou IA absente : l'étudiant lit pourquoi. Un échec ordinaire garde le message de l'appelant
    if (error instanceof AiError && error.kind !== "failed") throw new MemoError(error.message);
    throw error;
  }
  // Le modèle peut réécrire une fiche retirée malgré la consigne : elle ne repasse pas
  return { cards: withoutRemoved(parsed.cards, removed.map((r) => r.key)), model };
}

async function generate(documentId: string) {
  const { cards, model } = await writeCards(documentId);
  await db.insert(memoDecks).values({ documentId, cards, model, promptVersion: PROMPT_VERSION }).onConflictDoNothing();
  // Deux demandes simultanées : la première écrite reste la seule version
  const [deck] = await db.select().from(memoDecks).where(eq(memoDecks.documentId, documentId));
  return deck.cards;
}

export class MemoError extends Error {}

/** Une seule génération par cours, puis tout le monde lit la même sauvegarde : aucun appel d'IA inutile. */
export async function memoCardsFor(documentId: string) {
  const [deck] = await db.select().from(memoDecks).where(eq(memoDecks.documentId, documentId));
  if (deck) return deck.cards;
  if (!env.aiApiKey) throw new MemoError("Campuss IA n’est pas encore activée sur ce site.");
  const pending = running.get(documentId) ?? generate(documentId).finally(() => running.delete(documentId));
  running.set(documentId, pending);
  return pending;
}

/** L'ancien paquet reste en place jusqu'à ce que le nouveau soit prêt : un échec de l'IA ne retire rien aux lecteurs. */
export async function regenerateDeck(documentId: string) {
  if (!env.aiApiKey) throw new MemoError("Campuss IA n’est pas activée sur ce site.");
  const { cards, model } = await writeCards(documentId);
  if (!cards.length) throw new MemoError("Campuss IA n’a rien proposé de nouveau. Le paquet reste tel quel.");
  await db.transaction(async (tx) => {
    await tx.insert(memoDecks).values({ documentId, cards, model, promptVersion: PROMPT_VERSION }).onConflictDoUpdate({ target: memoDecks.documentId, set: { cards, model, promptVersion: PROMPT_VERSION, createdAt: new Date() } });
    await tx.update(memoCardReports).set({ status: "replaced", updatedAt: new Date() }).where(and(eq(memoCardReports.documentId, documentId), inArray(memoCardReports.status, ["open", "kept"])));
  });
  return cards;
}
