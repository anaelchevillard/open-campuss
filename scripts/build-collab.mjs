// Le serveur temps réel est empaqueté à part : Next ne l'embarque pas, il tourne en tête du même processus.
import { build } from "esbuild";

await build({
  entryPoints: ["src/collab/server.ts"], outfile: "collab.mjs", bundle: true, platform: "node", format: "esm", target: "node22", logLevel: "warning",
  external: ["pg-native"],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
