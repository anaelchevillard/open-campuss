// Faux clamd : parle le protocole INSTREAM et signale la signature de test EICAR.
import { createServer } from "node:net";

createServer((socket) => {
  let buffer = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    // Fin du flux : un bloc de taille zéro
    if (buffer.length >= 4 && buffer.subarray(-4).equals(Buffer.alloc(4))) {
      socket.end(buffer.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE") ? "stream: Eicar-Test-Signature FOUND\0" : "stream: OK\0");
    }
  });
  socket.on("error", () => undefined);
}).listen(3310);
