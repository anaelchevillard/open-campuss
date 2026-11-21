import { createServer, Server, type IncomingMessage } from "node:http";
import { connect } from "node:net";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { guardAbortedRequests } from "../src/lib/aborted-requests";

/** Ce que fait Next après le proxy (body-streams.js, replaceRequestBody) : la requête emprunte les méthodes d'un flux tampon. */
function likeNext(req: IncomingMessage) {
  const buffered = new Readable({ read() {} });
  for (const key in buffered) {
    const value = (buffered as unknown as Record<string, unknown>)[key];
    (req as unknown as Record<string, unknown>)[key] = typeof value === "function" ? value.bind(buffered) : value;
  }
}

describe("requête interrompue par le client", () => {
  it("la connexion coupée avant la réponse est absorbée, sans uncaughtException", async () => {
    const aborted: string[] = [];
    guardAbortedRequests(Server, (req) => aborted.push(`${req.method} ${req.url}`));
    const uncaught: unknown[] = [];
    const onUncaught = (error: unknown) => uncaught.push(error);
    process.on("uncaughtException", onUncaught);
    const server = createServer((req) => { likeNext(req); /* pas de réponse : le client part avant */ });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };
    await new Promise<void>((resolve) => {
      const socket = connect(port, "127.0.0.1", () => {
        socket.write("OPTIONS /admin/personnes HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\n\r\n");
        setTimeout(() => { socket.destroy(); setTimeout(resolve, 100); }, 50);
      });
    });
    server.close();
    process.off("uncaughtException", onUncaught);
    expect(uncaught).toEqual([]);
    expect(aborted).toEqual(["OPTIONS /admin/personnes"]);
  });
});
