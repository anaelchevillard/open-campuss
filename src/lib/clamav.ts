import "server-only";
import { createConnection } from "node:net";
import type { Readable } from "node:stream";
import { env } from "./env";

export const antivirusEnabled = () => Boolean(env.clamavHost);

export function pingAntivirus(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: env.clamavHost, port: env.clamavPort });
    let reply = "";
    socket.setTimeout(3000, () => socket.destroy(new Error("clamd ne répond pas")));
    socket.on("error", () => resolve(false));
    socket.on("data", (chunk) => { reply += chunk.toString(); });
    socket.on("end", () => resolve(reply.includes("PONG")));
    socket.on("close", () => resolve(reply.includes("PONG")));
    socket.write("zPING\0");
  });
}

/** Protocole INSTREAM de clamd. Renvoie la signature trouvée, ou null si le fichier est sain. Lève une erreur si clamd est injoignable. */
export function scanStream(stream: Readable): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: env.clamavHost, port: env.clamavPort });
    socket.setTimeout(120_000, () => socket.destroy(new Error("clamd ne répond pas")));
    let reply = "";
    socket.on("error", reject);
    socket.on("data", (chunk) => { reply += chunk.toString(); });
    socket.on("end", () => {
      const text = reply.replace(/\0/g, "").trim();
      if (/OK$/.test(text)) resolve(null);
      else if (/FOUND$/.test(text)) resolve(text.replace(/^stream:\s*/, "").replace(/\s*FOUND$/, ""));
      else reject(new Error(`réponse clamd inattendue : ${text.slice(0, 100)}`));
    });
    socket.write("zINSTREAM\0", async () => {
      try {
        for await (const chunk of stream) {
          const data = chunk as Buffer;
          const size = Buffer.alloc(4);
          size.writeUInt32BE(data.length);
          socket.write(size);
          socket.write(data);
        }
        socket.write(Buffer.alloc(4));
      } catch (error) {
        socket.destroy(error as Error);
      }
    });
  });
}
