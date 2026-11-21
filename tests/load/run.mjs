#!/usr/bin/env node
// Mesure sous charge, sans dépendance. Usage et réserves : README, section « Mesure sous charge ».
//   CAMPUSS_SESSION=<jeton> node tests/load/run.mjs http://localhost:3100 [--concurrency 10] [--requests 200] [--doc <uuid>] [--subject 1] [--q cours]
import { pathToFileURL } from "node:url";

const COOKIE = "__Host-campus";
const PRODUCTION_FLAG = "--viser-la-production";

export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

/** Rend l'adresse à viser, ou lève une erreur. La production n'est jamais visée par accident. */
export function checkTarget(raw, args = []) {
  let url;
  try { url = new URL(raw); } catch { throw new Error(`Adresse illisible : ${raw ?? "(aucune)"}`); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`Protocole refusé : ${url.protocol}`);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if ((host === "campuss.fr" || host.endsWith(".campuss.fr")) && !args.includes(PRODUCTION_FLAG)) {
    throw new Error(`${host} est la production. Refusé sans ${PRODUCTION_FLAG}.`);
  }
  return url.origin;
}

export function parseArgs(argv) {
  const options = { concurrency: 10, requests: 200, doc: "", subject: "1", q: "cours" };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === PRODUCTION_FLAG) continue;
    if (!arg.startsWith("--")) { positional.push(arg); continue; }
    const name = arg.slice(2);
    if (!(name in options)) throw new Error(`Option inconnue : ${arg}`);
    options[name] = argv[++i] ?? "";
  }
  options.concurrency = Number(options.concurrency);
  options.requests = Number(options.requests);
  if (!(options.concurrency >= 1) || !(options.requests >= 1)) throw new Error("--concurrency et --requests doivent être positifs.");
  return { base: positional[0], options };
}

export function summarize(route, samples, seconds) {
  const times = samples.map((s) => s.ms).sort((a, b) => a - b);
  const failed = samples.filter((s) => s.status !== 200).length;
  return { route, requests: samples.length, failed, median: percentile(times, 50), p95: percentile(times, 95), perSecond: samples.length / seconds };
}

export function renderTable(rows) {
  const head = ["route", "requêtes", "hors 200", "médiane (ms)", "p95 (ms)", "req/s"];
  const body = rows.map((r) => [r.route, String(r.requests), String(r.failed), r.median.toFixed(0), r.p95.toFixed(0), r.perSecond.toFixed(1)]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((row) => row[i].length)));
  const line = (cells) => cells.map((c, i) => (i ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join("  ");
  return [line(head), line(widths.map((w) => "-".repeat(w))), ...body.map(line)].join("\n");
}

// Plusieurs jetons séparés par des virgules : le cache de Shell est par compte, un seul compte le ferait jouer à plein
const cookies = (process.env.CAMPUSS_SESSION ?? "").split(",").map((t) => t.trim()).filter(Boolean).map((t) => `${COOKIE}=${t}`);

// Jamais de redirection suivie : une page sans session compte en « hors 200 », et rien ne part vers une autre adresse
async function hit(base, path, index) {
  const started = performance.now();
  const response = await fetch(base + path, { redirect: "manual", headers: { accept: "text/html,*/*", ...(cookies.length ? { cookie: cookies[index % cookies.length] } : {}) } });
  await response.arrayBuffer();
  return { ms: performance.now() - started, status: response.status };
}

async function measure(base, route, path, { concurrency, requests }) {
  const samples = [];
  let next = 0;
  const started = performance.now();
  await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, async () => {
    while (next < requests) {
      const index = next;
      next += 1;
      samples.push(await hit(base, path, index).catch(() => ({ ms: 0, status: 0 })));
    }
  }));
  return summarize(route, samples, (performance.now() - started) / 1000);
}

async function findDoc(base) {
  const response = await fetch(`${base}/`, { redirect: "manual", headers: cookies.length ? { cookie: cookies[0] } : {} });
  return (await response.text()).match(/\/d\/([0-9a-f-]{36})/)?.[1] ?? "";
}

async function main() {
  const argv = process.argv.slice(2);
  const { base: raw, options } = parseArgs(argv);
  const base = checkTarget(raw, argv);
  if (!cookies.length) console.error("CAMPUSS_SESSION absent : les pages répondront par une redirection vers la connexion.");
  const doc = options.doc || await findDoc(base);
  const routes = [["/", "/"], ["/matieres/" + options.subject, `/matieres/${options.subject}`], ["/d/<id>", doc ? `/d/${doc}` : ""], ["/api/search", `/api/search?q=${encodeURIComponent(options.q)}`]];
  const rows = [];
  // Une route après l'autre : les chiffres d'une route ne dépendent pas de la lenteur d'une autre
  for (const [route, path] of routes) {
    if (!path) { console.error(`${route} ignorée : aucun document trouvé sur l'accueil, passe --doc <uuid>.`); continue; }
    rows.push(await measure(base, route, path, options));
  }
  console.log(`${base}, ${options.concurrency} en parallèle, ${options.requests} requêtes par route, ${cookies.length || "aucune"} session(s)\n`);
  console.log(renderTable(rows));
  if (rows.some((r) => r.failed > r.requests / 10)) { console.error("\nPlus de 10 % de réponses hors 200 : ces chiffres ne mesurent pas les pages. Vérifie la session."); process.exitCode = 1; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exit(2); });
}
