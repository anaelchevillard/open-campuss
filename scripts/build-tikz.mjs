// Le fil de rendu TikZ (src/rich-worker/tikz-worker.mjs) est empaqueté à part, comme collab.mjs ;
// ses fichiers TeX (WebAssembly, image mémoire, paquets) vont dans tikz/, les polices Computer Modern dans
// public/vendor/tikz/ : tout est auto-hébergé, rien ne vient d'un CDN.
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

await build({
  entryPoints: ["src/rich-worker/tikz-worker.mjs"], outfile: "tikz-worker.mjs", bundle: true, platform: "node", format: "esm", target: "node22", logLevel: "warning",
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
rmSync("tikz", { recursive: true, force: true });
mkdirSync("tikz", { recursive: true });
cpSync("node_modules/node-tikzjax/tex", "tikz/tex", { recursive: true });
rmSync("public/vendor/tikz", { recursive: true, force: true });
cpSync("node_modules/node-tikzjax/css", "public/vendor/tikz", { recursive: true });
