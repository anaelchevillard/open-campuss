import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const ledger = vi.hoisted(() => ({
  aiPause: vi.fn(async () => null as null | { reason: string; message: string }),
  suspendAi: vi.fn(async () => undefined),
  recordAiUsage: vi.fn(async () => undefined),
}));
vi.mock("@/lib/ai/ledger", () => ledger);
vi.mock("@/lib/env", () => ({ env: { aiApiKey: "cle", aiBaseUrl: "https://ia.example/v1", aiModel: "modele", aiModelLight: "modele-leger" } }));

const { AiError, askAi, askAiJson, RETRY_DELAYS_MS } = await import("@/lib/ai/client");

const output = { name: "test", schema: { type: "object" }, parse: z.object({ ok: z.literal(true) }) };
const answer = (content: string, usage = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 150 }) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), { status: 200 });
const status = (code: number) => new Response("{}", { status: code });
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
  ledger.aiPause.mockReset().mockResolvedValue(null);
  ledger.suspendAi.mockClear();
  ledger.recordAiUsage.mockClear();
});

describe("client de Campuss IA", () => {
  it("envoie consignes en system, données en user, schéma JSON, plafonds par tâche, sans suivre de redirection", async () => {
    fetchMock.mockResolvedValueOnce(answer('{"ok":true}'));
    const { data, model } = await askAiJson("suggest", { system: "consignes", user: "<cours>\ntexte\n</cours>" }, output);
    expect(data).toEqual({ ok: true });
    expect(model).toBe("modele-leger");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://ia.example/v1/chat/completions");
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(String(init?.body));
    expect(body.messages).toEqual([{ role: "system", content: "consignes" }, { role: "user", content: "<cours>\ntexte\n</cours>" }]);
    expect(body.response_format).toEqual({ type: "json_schema", json_schema: { name: "test", schema: { type: "object" }, strict: true } });
    expect(body).toMatchObject({ model: "modele-leger", max_tokens: 300, temperature: 0 });
    // Pas de champ propre à Gemini vers un autre fournisseur
    expect(body.reasoning_effort).toBeUndefined();
  });

  it("réessaie après un 429 avec un délai, puis réussit", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(status(429)).mockResolvedValueOnce(answer("bonjour"));
    const pending = askAi("ocr", { system: "s", user: "u" });
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
    await expect(pending).resolves.toMatchObject({ text: "bonjour" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("abandonne après deux nouveaux essais sur 5xx, et ne réessaie jamais un 400", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(status(503));
    const pending = askAi("ocr", { system: "s", user: "u" }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS.reduce((a, b) => a + b, 0));
    expect(await pending).toMatchObject({ kind: "failed" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    fetchMock.mockReset().mockResolvedValue(status(400));
    await expect(askAi("ocr", { system: "s", user: "u" })).rejects.toMatchObject({ kind: "failed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("402 : suspend l'IA (alerte comprise), sans nouvel essai, avec un message clair", async () => {
    fetchMock.mockResolvedValue(status(402));
    const error = await askAi("quiz", { system: "s", user: "u" }).catch((e) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error.kind).toBe("paused");
    expect(error.message).toMatch(/pause/);
    expect(ledger.suspendAi).toHaveBeenCalledWith(402);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("en pause (budget ou suspension), aucun appel ne part", async () => {
    ledger.aiPause.mockResolvedValue({ reason: "budget", message: "limite du jour" });
    await expect(askAi("memo", { system: "s", user: "u" })).rejects.toMatchObject({ kind: "paused", message: "limite du jour" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ledger.recordAiUsage).not.toHaveBeenCalled();
  });

  it("rejette une sortie non conforme au schéma, et la compte comme une erreur", async () => {
    fetchMock.mockResolvedValueOnce(answer('Voici : {"ok":false,"consigne":"suivie"}'));
    await expect(askAiJson("memo", { system: "s", user: "u" }, output)).rejects.toMatchObject({ kind: "failed" });
    expect(ledger.recordAiUsage).toHaveBeenCalledWith(expect.objectContaining({ task: "memo", error: true, inputTokens: 100 }));
  });

  it("enregistre les jetons, réflexion du modèle comprise dans la sortie", async () => {
    fetchMock.mockResolvedValueOnce(answer('bavardage {"ok":true} fin'));
    await askAiJson("quiz", { system: "s", user: "u" }, output);
    expect(ledger.recordAiUsage).toHaveBeenCalledWith({ task: "quiz", model: "modele", inputTokens: 100, outputTokens: 50, error: false });
  });
});
