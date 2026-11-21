import "server-only";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { getText, putObject } from "@/lib/s3";
import { createSerialQueue } from "@/lib/serial-queue";
import { sanitizeSvg } from "./svg";
import { checkTikz, TIKZ_RENDER_VERSION } from "./tikz";

const TIMEOUT_MS = 8000;
const queue = createSerialQueue({ maxPending: 20, maxWaitMs: 60_000 });
const WORKER = () => join(process.cwd(), "tikz-worker.mjs");
const TEX_DIR = () => join(process.cwd(), "tikz", "tex");

export const tikzHash = (tex: string) => createHash("sha256").update(`${TIKZ_RENDER_VERSION}\n${tex}`).digest("hex");
const cacheKey = (hash: string) => `rich/tikz/${hash}.svg`;
export const tikzAvailable = () => existsSync(WORKER()) && existsSync(TEX_DIR());

export type TikzResult = { ok: true; svg: string; hash: string } | { ok: false; error: string };

/** Le SVG déjà rendu, s'il est en cache : rien n'est calculé à la lecture d'un cours. */
export async function cachedTikz(source: string): Promise<TikzResult | null> {
  const check = checkTikz(source);
  if (!check.ok) return { ok: false, error: check.error };
  const hash = tikzHash(check.tex);
  const svg = await getText(cacheKey(hash)).catch(() => null);
  return svg ? { ok: true, svg, hash } : null;
}

function runWorker(tex: string): Promise<{ svg?: string; error?: string }> {
  return new Promise((resolve) => {
    // Un fil neuf par figure : une boucle TeX sans fin est coupée sans toucher au serveur, la mémoire est rendue
    const worker = new Worker(WORKER(), { workerData: { texDir: TEX_DIR() }, resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 64 } });
    const timer = setTimeout(() => { void worker.terminate(); resolve({ error: "Figure trop longue à calculer." }); }, TIMEOUT_MS);
    worker.once("message", (message: { svg?: string; error?: string }) => { clearTimeout(timer); void worker.terminate(); resolve(message); });
    worker.once("error", () => { clearTimeout(timer); resolve({ error: "Le rendu TikZ a échoué." }); });
    worker.postMessage(tex);
  });
}

/** Rend (ou relit) une figure ; le SVG produit est nettoyé comme un SVG d'auteur avant d'être gardé. */
export async function renderTikz(source: string): Promise<TikzResult> {
  const cached = await cachedTikz(source);
  if (cached) return cached;
  const check = checkTikz(source);
  if (!check.ok) return { ok: false, error: check.error };
  if (!tikzAvailable()) return { ok: false, error: "Le rendu TikZ n’est pas installé sur ce serveur." };
  const hash = tikzHash(check.tex);
  const out = await queue.run(() => runWorker(check.tex));
  if (!out.svg) return { ok: false, error: out.error ?? "Le rendu TikZ a échoué." };
  const clean = sanitizeSvg(out.svg, `tz${hash.slice(0, 8)}`);
  if (!clean.ok) return { ok: false, error: clean.error };
  await putObject(cacheKey(hash), clean.html, "image/svg+xml");
  return { ok: true, svg: clean.html, hash };
}
