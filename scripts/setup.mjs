#!/usr/bin/env node
// Prépare .env pour un premier lancement : secrets aléatoires, adresse du site et mail de l'administrateur.
// Sans dépendance. N'écrase jamais un .env existant.
//
//   npm run setup            questions (Entrée garde la valeur proposée)
//   npm run setup -- --yes   valeurs par défaut, sans question (essai local, CI)
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const ENV_FILE = ".env";
const EXAMPLE_FILE = ".env.example";
const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_ADMIN_EMAIL = "admin@example.org";
const DEV_DB_PORT = 5432;
const DEV_S3_PORT = 9000;

const hex = (bytes) => randomBytes(bytes).toString("hex");

function fail(message) {
  console.error(`setup : ${message}`);
  process.exit(1);
}

function parseBaseUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

const isEmail = (raw) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);

async function askAll() {
  const quiet = process.argv.includes("--yes") || !process.stdin.isTTY;
  if (quiet) return { baseUrl: DEFAULT_BASE_URL, adminEmail: DEFAULT_ADMIN_EMAIL };
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ask = async (question, fallback, valid) => {
      for (;;) {
        const answer = (await rl.question(`${question} [${fallback}] : `)).trim() || fallback;
        const value = valid(answer);
        if (value) return value;
        console.log("  Valeur invalide, réessayer.");
      }
    };
    const baseUrl = await ask("Adresse du site", DEFAULT_BASE_URL, parseBaseUrl);
    const adminEmail = await ask("Mail de l'administrateur", DEFAULT_ADMIN_EMAIL, (v) => (isEmail(v) ? v.toLowerCase() : null));
    return { baseUrl, adminEmail };
  } finally {
    rl.close();
  }
}

/** Remplace la valeur de chaque variable présente dans le modèle ; les autres lignes restent telles quelles. */
function fill(template, values) {
  const missing = Object.keys(values).filter((key) => !new RegExp(`^${key}=`, "m").test(template));
  if (missing.length) fail(`${EXAMPLE_FILE} ne contient pas : ${missing.join(", ")}`);
  return template.replace(/^([A-Z0-9_]+)=.*$/gm, (line, key) => (key in values ? `${key}=${values[key]}` : line));
}

/** Port publié par Docker Compose : celui de l'adresse locale, sinon 3000. */
function localPort(baseUrl) {
  const url = new URL(baseUrl);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  return local && url.port ? url.port : "3000";
}

async function main() {
  if (existsSync(ENV_FILE)) {
    console.log(`${ENV_FILE} existe déjà : rien n'est modifié. Pour repartir de zéro, supprimer ce fichier.`);
    return;
  }
  if (!existsSync(EXAMPLE_FILE)) fail(`${EXAMPLE_FILE} introuvable : lancer la commande à la racine du dépôt.`);

  const { baseUrl, adminEmail } = await askAll();
  const postgresPassword = hex(24);
  const s3Secret = hex(24);
  const values = {
    BASE_URL: baseUrl,
    CAMPUS_PORT: localPort(baseUrl),
    SECRET_KEY: randomBytes(48).toString("base64url"),
    ADMIN_EMAIL: adminEmail,
    POSTGRES_PASSWORD: postgresPassword,
    MINIO_ROOT_PASSWORD: hex(24),
    S3_APP_SECRET: s3Secret,
    DATABASE_URL: `postgresql://campus:${postgresPassword}@localhost:${DEV_DB_PORT}/campus`,
    S3_ENDPOINT: `http://localhost:${DEV_S3_PORT}`,
    S3_SECRET_KEY: s3Secret,
  };
  writeFileSync(ENV_FILE, fill(readFileSync(EXAMPLE_FILE, "utf8"), values), { mode: 0o600, flag: "wx" });

  console.log(`
${ENV_FILE} créé (secrets aléatoires, lisible par vous seul).

  docker compose up -d          lance Campuss (premier lancement : construction de l'image, quelques minutes)
  npm run admin:password        mot de passe provisoire de ${adminEmail}
  ${baseUrl}

Les fonctions facultatives (mails, Campuss IA, notifications…) se règlent dans ${ENV_FILE}.`);
}

await main();
