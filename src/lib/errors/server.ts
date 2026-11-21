import "server-only";
import { env } from "@/lib/env";
import { visitorAddress } from "@/lib/visitor";
import { SERVER_PER_MINUTE, takeSlot, type Window } from "./limit";
import { recordError } from "./record";

const recent: Window = new Map();

/** Contrôle de flux de Next (redirection, 404, rendu dynamique) et requête abandonnée : pas des erreurs. */
export function isControlFlow(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const { digest, message, name } = error as { digest?: unknown; message?: unknown; name?: unknown };
  return (typeof digest === "string" && /^(NEXT_|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT)/.test(digest))
    || (typeof message === "string" && /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK)/.test(message))
    || name === "AbortError" || (typeof message === "string" && message === "aborted");
}

type Headers = Record<string, string | string[] | undefined>;
const headerOf = (headers: Headers) => (name: string) => {
  const value = headers[name];
  return Array.isArray(value) ? value.join(",") : value ?? null;
};

/**
 * Erreur du serveur (onRequestError, tâches de fond). Seuls le type, le message et la pile nettoyés, la route (fichier
 * de route de Next, sans paramètres) et la famille du navigateur sont gardés : ni corps, ni cookies, ni en-têtes.
 * Ne lève jamais : une panne de la base ne doit pas transformer une erreur en deux.
 */
export async function captureServerError(error: unknown, where: { route: string; headers?: Headers }) {
  try {
    if (isControlFlow(error)) return;
    if (!takeSlot(recent, "site", SERVER_PER_MINUTE, 60_000)) return;
    const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Erreur sans message");
    const get = headerOf(where.headers ?? {});
    await recordError({
      source: "server", name: err.name, message: err.message, stack: err.stack, route: where.route,
      userAgent: get("user-agent") ?? "", ip: where.headers ? visitorAddress(get, env.trustedIpHeader) : "",
    });
  } catch (failure) {
    console.error("erreur non enregistrée", failure instanceof Error ? failure.message : failure);
  }
}
