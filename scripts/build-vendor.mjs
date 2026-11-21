// Construit les bibliothèques des artefacts React : le navigateur des lecteurs ne contacte plus aucun CDN.
import { build } from "esbuild";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const out = "public/vendor/lib";
const tmp = ".vendor-entries";
rmSync(out, { recursive: true, force: true });
rmSync(tmp, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
mkdirSync(tmp, { recursive: true });

const entries = {
  react: "react", "react-dom": "react-dom", "react-dom-client": "react-dom/client", "react-jsx-runtime": "react/jsx-runtime",
  "lucide-react": "lucide-react", recharts: "recharts", lodash: "lodash", d3: "d3", mathjs: "mathjs", papaparse: "papaparse",
};
const isId = (k) => /^[A-Za-z_$][\w$]*$/.test(k) && !["default", "module", "__esModule", "eval", "arguments"].includes(k);
const points = {};
for (const [name, spec] of Object.entries(entries)) {
  const file = join(tmp, `${name}.mjs`);
  if (["react", "react-dom", "react-dom-client", "react-jsx-runtime", "lodash", "papaparse"].includes(name)) {
    // Modules CommonJS : leurs exports nommés doivent être énumérés pour un import ES
    const keys = Object.keys(require(spec)).filter(isId);
    writeFileSync(file, `import M from ${JSON.stringify(spec)};\nexport default M;\nexport const { ${keys.join(", ")} } = M;\n`);
  } else {
    writeFileSync(file, `export * from ${JSON.stringify(spec)};\nimport * as M from ${JSON.stringify(spec)};\nexport default M.default ?? M;\n`);
  }
  points[name] = file;
}
await build({
  entryPoints: points, bundle: true, splitting: true, format: "esm", outdir: out, entryNames: "[name]", chunkNames: "chunk-[hash]",
  minify: true, legalComments: "none", platform: "browser", define: { "process.env.NODE_ENV": '"production"', global: "globalThis" }, target: "es2020", logLevel: "warning",
});
rmSync(tmp, { recursive: true, force: true });
copyFileSync("node_modules/@babel/standalone/babel.min.js", "public/vendor/lib/babel.min.js");
copyFileSync("node_modules/@tailwindcss/browser/dist/index.global.js", "public/vendor/lib/tailwind.js");
