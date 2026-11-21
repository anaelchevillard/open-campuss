// Rendu TikZ → SVG, dans un fil d'exécution à part (worker_threads), empaqueté par
// scripts/build-tikz.mjs. Le moteur TeX est celui de TikZJax (WebAssembly, via node-tikzjax, LPPL 1.3c), ses fichiers
// sont lus dans un système de fichiers en mémoire : rien n'est lu ni écrit sur le disque, aucune commande système
// (pas de \write18). Le fil principal coupe le rendu au bout de quelques secondes (boucle TeX infinie) et nettoie le SVG.
import { parentPort, workerData } from "node:worker_threads";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { createGunzip } from "node:zlib";
import { createHash } from "node:crypto";
import { Volume, createFsFromVolume } from "memfs";
import { extract } from "tar-fs";
import { dvi2html } from "@prinsss/dvi2html";
import * as library from "node-tikzjax/dist/library.js";

const TEX_DIR = workerData.texDir;

const gunzip = (path) => new Promise((resolve, reject) => {
  const chunks = [];
  createReadStream(path).pipe(createGunzip()).on("data", (c) => chunks.push(c)).on("end", () => resolve(Buffer.concat(chunks))).on("error", reject);
});

async function texFiles() {
  const fs = createFsFromVolume(new Volume());
  fs.mkdirSync("/lib");
  await new Promise((resolve, reject) => {
    createReadStream(join(TEX_DIR, "tex_files.tar.gz")).pipe(createGunzip()).pipe(extract("/tex_files", { fs })).on("finish", resolve).on("error", reject);
  });
  return fs;
}

async function render(input) {
  const [coredump, bytecode, files] = await Promise.all([gunzip(join(TEX_DIR, "core.dump.gz")), gunzip(join(TEX_DIR, "tex.wasm.gz")), texFiles()]);
  library.writeFileSync("input.tex", Buffer.from(input));
  const memory = new WebAssembly.Memory({ initial: library.pages, maximum: library.pages });
  new Uint8Array(memory.buffer, 0, library.pages * 65536).set(coredump);
  library.setMemory(memory.buffer);
  library.setInput(" input.tex \n\\end\n");
  library.setFileLoader(async (name) => files.readFileSync(name));
  const wasm = await WebAssembly.instantiate(bytecode, { library, env: { memory } });
  await library.executeAsync(wasm.instance.exports);
  let dvi;
  try { dvi = Buffer.from(library.readFileSync("input.dvi")); } catch { throw new Error("TeX n’a produit aucune figure : vérifie le code TikZ."); }
  let html = "";
  await dvi2html((async function* () { yield dvi; })(), { write(chunk) { html += chunk.toString(); } });
  // Identifiants propres à cette figure (plusieurs figures dans la même page), comme node-tikzjax
  const hash = createHash("sha1").update(html).digest("hex").slice(0, 8);
  const ids = (html.match(/\bid="pgf[^"]*"/g) ?? []).sort((a, b) => b.length - a.length);
  for (const id of ids) { const name = id.replace(/id="pgf(.*)"/, "$1"); html = html.replaceAll("pgf" + name, `pgf${hash}${name}`); }
  return html.replaceAll("&#173;", "&#172;");
}

parentPort.once("message", async (input) => {
  try { parentPort.postMessage({ svg: await render(String(input)) }); } catch (error) { parentPort.postMessage({ error: String(error?.message ?? error).slice(0, 300) }); }
});
