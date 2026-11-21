import type { IncomingMessage, Server, ServerResponse } from "node:http";

const GUARDED = Symbol.for("campuss.abortedRequests");

/**
 * Requête interrompue par le client (onglet fermé, navigation, connexion coupée) avant la fin de la réponse.
 *
 * Node détruit alors la requête avec `Error: aborted` (ECONNRESET). D'ordinaire l'erreur n'est émise que si quelqu'un
 * l'écoute ; mais pour toute requête avec corps (POST, OPTIONS…), Next copie sur la requête les méthodes d'un flux
 * tampon (`replaceRequestBody`, après le proxy) : `destroy` vise ce flux, qui émet l'erreur sans écouteur →
 * `uncaughtException` (vu au banc : un OPTIONS coupé par le navigateur). On pose un écouteur au moment où la
 * connexion se ferme avant la fin de la réponse : `req.on` vise alors le bon flux, l'erreur est attendue et absorbée.
 */
export function guardAbortedRequests(server: { prototype: Server }, onAborted: (req: IncomingMessage) => void = () => undefined) {
  const proto = server.prototype as Server & { [GUARDED]?: true };
  if (proto[GUARDED]) return;
  proto[GUARDED] = true;
  const emit = proto.emit;
  proto.emit = function guarded(this: Server, event: string, ...args: unknown[]) {
    if (event === "request") {
      const [req, res] = args as [IncomingMessage, ServerResponse];
      // « close » de la réponse part dans le même tour que la destruction de la requête, avant l'émission de l'erreur
      res.once("close", () => {
        if (res.writableFinished) return;
        req.on("error", (error: Error & { code?: string }) => { if (error.code === "ECONNRESET") onAborted(req); });
      });
    }
    return (emit as (this: Server, ...all: unknown[]) => boolean).call(this, event, ...args);
  } as typeof proto.emit;
}
