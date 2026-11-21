// Le jeu de démonstration (scripts/seed-demo.ts) est empaqueté pour tourner dans l'image : npm run demo:seed
import { build } from "esbuild";

await build({
  entryPoints: ["scripts/seed-demo.ts"], outfile: "seed-demo.mjs", bundle: true, platform: "node", format: "esm", target: "node22", logLevel: "warning",
  // Modules natifs : ceux de l'image (node_modules de la sortie autonome de Next)
  external: ["pg-native", "@node-rs/argon2"],
  alias: { "@": "./src" },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
