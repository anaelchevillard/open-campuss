// Envoi des erreurs du navigateur. Aucun identifiant : ni compte, ni cookie lu, ni stockage local.
import { isNoise, LIMITS, scrubStack, scrubText } from "./scrub";
import { shouldSend } from "./limit";

/** Part des erreurs envoyées (1 = toutes, après le dédoublonnage par page). */
export const SAMPLE_RATE = 1;

let seen = new Set<string>();
let page = "";

type Kind = "error" | "rejection" | "react";

/** Corps envoyé : déjà nettoyé et borné ici, nettoyé de nouveau par le serveur. */
export function reportBody(kind: Kind, error: unknown, path: string) {
  const err = error instanceof Error ? error : null;
  const message = err ? err.message : typeof error === "string" ? error : (() => { try { return JSON.stringify(error); } catch { return String(error); } })();
  return {
    kind,
    name: scrubText(err?.name ?? "", LIMITS.name),
    message: scrubText(message, LIMITS.message),
    stack: scrubStack(err?.stack ?? ""),
    path: path.split(/[?#]/)[0].slice(0, 300),
  };
}

export function reportError(kind: Kind, error: unknown) {
  try {
    if (typeof window === "undefined") return;
    // Le compteur repart à chaque page : une navigation côté client compte comme une nouvelle page
    if (location.pathname !== page) {
      page = location.pathname;
      seen = new Set();
    }
    const body = reportBody(kind, error, location.pathname);
    if (isNoise(body.message, body.stack)) return;
    if (!shouldSend(seen, `${body.name}|${body.message}`, SAMPLE_RATE, Math.random())) return;
    const data = JSON.stringify(body);
    const blob = new Blob([data], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/errors", blob)) {
      void fetch("/api/errors", { method: "POST", keepalive: true, credentials: "omit", headers: { "Content-Type": "application/json" }, body: data }).catch(() => undefined);
    }
  } catch {
    // Le signalement d'une erreur ne doit jamais en provoquer une autre
  }
}
