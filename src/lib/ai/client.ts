import "server-only";
import { env } from "../env";
import { aiPause, recordAiUsage, suspendAi } from "./ledger";

/**
 * Seul point d'appel vers le fournisseur d'IA (API compatible OpenAI) : consignes en message system, données en message user,
 * sortie JSON contrainte par un schéma, plafonds de jetons, de temps et de budget, nouvel essai mesuré.
 * Ce que le modèle répond n'est jamais cru : la validation zod reste le seul juge (OWASP LLM05).
 */

export type AiTask = "memo" | "quiz" | "suggest" | "ocr";

type TaskConfig = { maxTokens: number; temperature: number; timeoutMs: number; model: () => string; reasoning: "none" | "low" };

// max_tokens compte aussi la réflexion du modèle : la marge couvre le niveau « low » (environ 1 000 jetons)
export const AI_TASKS: Record<AiTask, TaskConfig> = {
  memo: { maxTokens: 4096, temperature: 0.2, timeoutMs: 120_000, model: () => env.aiModel, reasoning: "low" },
  quiz: { maxTokens: 4096, temperature: 0.2, timeoutMs: 120_000, model: () => env.aiModel, reasoning: "low" },
  suggest: { maxTokens: 300, temperature: 0, timeoutMs: 20_000, model: () => env.aiModelLight, reasoning: "none" },
  ocr: { maxTokens: 8192, temperature: 0.1, timeoutMs: 120_000, model: () => env.aiModel, reasoning: "none" },
};

/** Délais avant chaque nouvel essai, sur 429 ou 5xx seulement : deux au plus, de plus en plus longs. */
export const RETRY_DELAYS_MS = [1_000, 4_000];
const SUSPENDING = new Set([401, 402, 403]);

export type AiErrorKind = "unavailable" | "paused" | "busy" | "failed";

/** Le message est destiné à l'étudiant ; le détail technique part seulement dans les journaux. */
export class AiError extends Error {
  constructor(readonly kind: AiErrorKind, message: string) { super(message); }
}

const MESSAGES = {
  unavailable: "Campuss IA n’est pas encore activée sur ce site.",
  busy: "Campuss IA est très demandée en ce moment. Réessaie dans quelques minutes.",
  silent: "Le service d’IA ne répond pas. Réessaie dans un instant.",
  failed: "Campuss IA n’a pas réussi cette fois. Réessaie dans un instant.",
  suspended: "Campuss IA est en pause à cause d’un souci chez notre fournisseur. L’équipe est prévenue : réessaie dans une demi-heure.",
};

export type AiContent = string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];
/** parse : un schéma zod, ou toute fonction qui lève une erreur sur une sortie non conforme. */
export type JsonOutput<T> = { name: string; schema: Record<string, unknown>; parse: { parse: (value: unknown) => T } };
type Request = { system: string; user: AiContent };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Réflexion réglable (et coupable) seulement sur Gemini 2.5 Flash ; un autre fournisseur pourrait refuser le champ
const reasoningFor = (model: string, level: TaskConfig["reasoning"]) =>
  /(^|\.)googleapis\.com$/.test(safeHost(env.aiBaseUrl)) && /^gemini-2\.5-flash/.test(model) ? { reasoning_effort: level } : {};
function safeHost(url: string) { try { return new URL(url).hostname; } catch { return ""; } }

type Usage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
/** La réflexion du modèle est facturée en sortie : total moins entrée quand le fournisseur la sépare. */
function tokensOf(usage: Usage | undefined) {
  const input = Math.max(0, Number(usage?.prompt_tokens) || 0);
  const output = Math.max(0, Number(usage?.completion_tokens) || 0, (Number(usage?.total_tokens) || 0) - input);
  return { inputTokens: input, outputTokens: output };
}

/** Le premier objet JSON de la réponse, même entouré de bavardage. */
export function extractJson(raw: string): unknown {
  return JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
}

async function call<T>(task: AiTask, request: Request, finish: (text: string) => T, output?: JsonOutput<unknown>) {
  if (!env.aiApiKey) throw new AiError("unavailable", MESSAGES.unavailable);
  const pause = await aiPause();
  if (pause) throw new AiError("paused", pause.message);
  const config = AI_TASKS[task];
  const model = config.model();
  const body = JSON.stringify({
    model, temperature: config.temperature, max_tokens: config.maxTokens,
    messages: [{ role: "system", content: request.system }, { role: "user", content: request.user }],
    ...(output ? { response_format: { type: "json_schema", json_schema: { name: output.name, schema: output.schema, strict: true } } } : {}),
    ...reasoningFor(model, config.reasoning),
  });
  const spend = { task, model, inputTokens: 0, outputTokens: 0, error: true };
  try {
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await fetch(`${env.aiBaseUrl}/chat/completions`, {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(config.timeoutMs), body,
          headers: { Authorization: `Bearer ${env.aiApiKey}`, "Content-Type": "application/json" },
        });
      } catch (error) {
        // Un délai dépassé ne se retente pas : l'appel suivant attendrait aussi longtemps
        const timeout = (error as Error).name === "TimeoutError";
        if (timeout || attempt >= RETRY_DELAYS_MS.length) throw logged(task, new AiError("failed", MESSAGES.silent), (error as Error).message);
        await wait(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      if (response.ok) {
        const data = await response.json().catch(() => null) as { choices?: { message?: { content?: unknown } }[]; usage?: Usage } | null;
        Object.assign(spend, tokensOf(data?.usage));
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || !content.trim()) throw logged(task, new AiError("failed", MESSAGES.failed), "réponse vide");
        try {
          const result = finish(content);
          spend.error = false;
          return { result, model };
        } catch (error) {
          throw logged(task, new AiError("failed", MESSAGES.failed), `sortie refusée : ${(error as Error).message.slice(0, 200)}`);
        }
      }
      await response.body?.cancel().catch(() => undefined);
      if (SUSPENDING.has(response.status)) {
        await suspendAi(response.status);
        throw logged(task, new AiError("paused", MESSAGES.suspended), `réponse ${response.status}, IA suspendue`);
      }
      const transient = response.status === 429 || response.status >= 500;
      if (transient && attempt < RETRY_DELAYS_MS.length) {
        await wait(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw logged(task, new AiError(response.status === 429 ? "busy" : "failed", response.status === 429 ? MESSAGES.busy : MESSAGES.failed), `réponse ${response.status}`);
    }
  } finally {
    await recordAiUsage(spend).catch((error) => console.warn("usage IA :", (error as Error).message));
  }
}

function logged(task: AiTask, error: AiError, detail: string) {
  console.warn(`ia ${task} : ${detail}`);
  return error;
}

/** Réponse en texte libre (transcription). */
export async function askAi(task: AiTask, request: Request) {
  const { result, model } = await call(task, request, (text) => text);
  return { text: result, model };
}

/** Réponse JSON contrainte par output.schema, puis validée par output.parse : une sortie non conforme est rejetée. */
export async function askAiJson<T>(task: AiTask, request: Request, output: JsonOutput<T>) {
  const { result, model } = await call(task, request, (text) => output.parse.parse(extractJson(text)), output);
  return { data: result, model };
}
