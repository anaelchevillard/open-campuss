import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Une requête coupée par le client ne doit jamais finir en uncaughtException (lib/aborted-requests.ts)
  const [{ Server }, { guardAbortedRequests }] = await Promise.all([import("node:http"), import("./lib/aborted-requests")]);
  guardAbortedRequests(Server);
  const { boot } = await import("./lib/boot");
  await boot();
}

/**
 * Erreurs du serveur : regroupées dans Admin › Erreurs. La route est le fichier de route de Next
 * (/d/[id], jamais l'adresse réelle) ; les en-têtes ne servent qu'à la famille du navigateur et à l'empreinte du jour.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { captureServerError } = await import("./lib/errors/server");
  await captureServerError(error, { route: `${context.routeType} ${context.routePath}`, headers: request.headers });
};
