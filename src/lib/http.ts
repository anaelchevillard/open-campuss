import "server-only";
import { Readable } from "node:stream";

export const nodeToWeb = (stream: Readable) => Readable.toWeb(stream) as unknown as ReadableStream;

export const notFoundResponse = () => new Response("Introuvable", {
  status: 404, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" },
});

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

// Le HTML importé contient du JavaScript : il s'exécute dans une origine opaque, sans cookies ni accès au
// reste du site, y compris si son URL est ouverte directement dans un onglet.
export const SANDBOX_POLICY = "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads";
