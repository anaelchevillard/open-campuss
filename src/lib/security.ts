import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { and, count, eq, gt, inArray } from "drizzle-orm";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db, schema } from "./db";
import { env, VIEW_TOKEN_SECONDS } from "./env";

// Argon2id, paramètres OWASP. Le coût mémoire limite aussi le débit d'un attaquant sur le serveur.
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
export { MIN_PASSWORD } from "./constants";
import { MIN_PASSWORD } from "./constants";

let dummyHash: Promise<string> | undefined;

export const hashPassword = (password: string) => hash(password, ARGON);

/** Temps homogène : une adresse inconnue coûte autant qu'un mauvais mot de passe. */
export async function verifyPassword(stored: string | null | undefined, password: string) {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  try {
    const valid = await verify(stored ?? await dummyHash, password);
    return valid && Boolean(stored);
  } catch {
    return false;
  }
}

export function passwordProblem(password: string, email = ""): string | null {
  if (password.length < MIN_PASSWORD) return `Le mot de passe doit contenir au moins ${MIN_PASSWORD} caractères.`;
  if (password.length > 256) return "Le mot de passe est trop long.";
  if (new Set(password).size < 5) return "Ce mot de passe est trop répétitif.";
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (local.length > 3 && password.toLowerCase().includes(local)) return "Le mot de passe ne doit pas contenir ton adresse.";
  return null;
}

/**
 * Mot de passe déjà vu dans des fuites ? Seuls les 5 premiers caractères de son empreinte SHA-1 quittent le serveur
 * (k-anonymat). Si le service ne répond pas, on n'empêche personne de s'inscrire.
 */
export async function isPwned(password: string) {
  const digest = createHash("sha1").update(password).digest("hex").toUpperCase();
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${digest.slice(0, 5)}`, { headers: { "Add-Padding": "true" }, signal: AbortSignal.timeout(3000) });
    if (!response.ok) return false;
    return (await response.text()).split("\n").some((line) => { const [suffix, n] = line.trim().split(":"); return suffix === digest.slice(5) && Number(n) > 0; });
  } catch {
    return false;
  }
}

export async function strongPasswordProblem(password: string, email = "") {
  return passwordProblem(password, email) ?? (await isPwned(password) ? "Ce mot de passe figure dans des fuites de données connues. Choisis-en un autre." : null);
}

export const randomToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function rateLimited(key: string, limit: number, minutes: number) {
  const [row] = await db.select({ value: count() }).from(schema.rateEvents).where(and(
    eq(schema.rateEvents.key, key.slice(0, 320)),
    gt(schema.rateEvents.at, new Date(Date.now() - minutes * 60_000)),
  ));
  return row.value >= limit;
}

export const rateHit = (key: string) => db.insert(schema.rateEvents).values({ key: key.slice(0, 320) });

/**
 * Pour un secret devinable (code à 6 chiffres, mot de passe) : l'essai est inscrit AVANT d'être jugé, puis compté.
 * Avec rateLimited suivi de rateHit, des requêtes parallèles passaient toutes le contrôle avant la première inscription.
 * Le k-ième essai inscrit voit au moins k lignes : au plus `limit` essais passent par fenêtre, même en rafale.
 */
export async function rateTake(key: string, limit: number, minutes: number) {
  await rateHit(key);
  return !(await rateLimited(key, limit + 1, minutes));
}

/**
 * Même principe sur plusieurs plafonds à la fois. `release` retire les essais inscrits par cet appel : pour un refus
 * (il ne compte pas) ou une réussite (seuls les échecs comptent), sans rouvrir la course.
 */
export async function rateTakeAll(rules: readonly (readonly [key: string, limit: number, minutes: number])[]) {
  const ids = await Promise.all(rules.map(([key]) => db.insert(schema.rateEvents).values({ key: key.slice(0, 320) }).returning({ id: schema.rateEvents.id }).then(([row]) => row.id)));
  const release = async () => { await db.delete(schema.rateEvents).where(inArray(schema.rateEvents.id, ids)); };
  for (const [key, limit, minutes] of rules) {
    if (await rateLimited(key, limit + 1, minutes)) return { ok: false, release };
  }
  return { ok: true, release };
}
export const rateClear = (key: string) => db.delete(schema.rateEvents).where(eq(schema.rateEvents.key, key.slice(0, 320)));

const sign = (payload: string) => createHmac("sha256", env.secretKey).update(`view:${payload}`).digest("base64url");

/**
 * Le contenu sandboxé a une origine opaque : le cookie de session n'accompagne pas ses sous-ressources.
 * L'accès passe par un jeton limité à un document, un utilisateur et une durée ; il ne donne rien d'autre.
 */
export function viewToken(docId: string, userId: string) {
  const payload = `${docId}.${userId}.${Math.floor(Date.now() / 1000) + VIEW_TOKEN_SECONDS}`;
  return `${payload}.${sign(payload)}`;
}

export function parseViewToken(token: string): { docId: string; userId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [docId, userId, expires, signature] = parts;
  if (!safeEqual(signature, sign(`${docId}.${userId}.${expires}`))) return null;
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now() / 1000) return null;
  return { docId, userId };
}

export type UnsubscribeScope = "weekly" | "notifications";

// Le résumé garde son ancienne signature : les liens déjà envoyés, sans expiration, restent valables
const signUnsubscribe = (userId: string, scope: UnsubscribeScope) =>
  createHmac("sha256", env.secretKey).update(scope === "weekly" ? `unsubscribe:${userId}` : `unsubscribe:${scope}:${userId}`).digest("base64url");

/** Lien de désinscription : sans connexion ni expiration, il ne permet que de couper ce type de mail. */
export const unsubscribeToken = (userId: string, scope: UnsubscribeScope = "weekly") =>
  scope === "weekly" ? `${userId}.${signUnsubscribe(userId, scope)}` : `${userId}.${signUnsubscribe(userId, scope)}.${scope}`;

export function parseUnsubscribeToken(token: string): { userId: string; scope: UnsubscribeScope } | null {
  const [userId, signature, scope = "weekly", ...rest] = token.split(".");
  if (!userId || !signature || rest.length || (scope !== "weekly" && scope !== "notifications")) return null;
  if (scope === "weekly" && token.split(".").length !== 2) return null;
  if (!safeEqual(signature, signUnsubscribe(userId, scope))) return null;
  return { userId, scope };
}
