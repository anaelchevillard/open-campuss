import { createSerialQueue } from "./serial-queue";

// Convertir un fichier charge tout en mémoire et le conteneur est borné : un seul à la fois. Délai inférieur aux 100 s de Cloudflare.
const globals = globalThis as unknown as { campusImports?: ReturnType<typeof createSerialQueue> };
export const importQueue = (globals.campusImports ??= createSerialQueue({ maxPending: 5, maxWaitMs: 60_000 }));
