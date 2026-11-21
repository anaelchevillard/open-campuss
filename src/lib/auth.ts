import "server-only";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { visitorAddress } from "./visitor";
import { cache } from "react";
import { db, schema } from "./db";
import { TERMS_VERSION } from "./db/categories";
import type { User } from "./db/schema";
import { browserOf, deviceOf } from "./analytics-utils";
import { env, SESSION_DAYS } from "./env";
import { queueMail } from "./mail";
import { authMails } from "@/lib/mail/catalog";
import { recordVisit } from "./notification-state";
import { randomToken, tokenHash } from "./security";
import { isStepUpFresh, type StepUpRequired } from "./step-up";
import { STEP_UP_CRITICAL_MS } from "./admin-actions";
import { VIEW_COOKIE } from "./impersonation-rules";
import { accessRefusal } from "./suspension";

export const SESSION_COOKIE = "__Host-campus";

export async function clientIp() {
  const store = await headers();
  return visitorAddress((name) => store.get(name), env.trustedIpHeader);
}

export async function audit(actor: string, action: string, target = "") {
  await db.insert(schema.auditLog).values({ actor: actor.slice(0, 254), action, target: target.slice(0, 300), ip: await clientIp() });
}

export async function createSession(userId: string, mfaPending = false, stepUp = false) {
  const token = randomToken();
  const agent = (await headers()).get("user-agent") ?? "";
  await db.insert(schema.sessions).values({
    tokenHash: tokenHash(token), userId, mfaPending, stepUpAt: stepUp ? new Date() : null, userAgent: agent.slice(0, 200), ip: await clientIp(), expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86_400,
  });
}

export async function destroyCurrentSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash(token)));
  store.delete({ name: SESSION_COOKIE, path: "/", secure: true, httpOnly: true, sameSite: "lax" });
}

export async function revokeSessions(userId: string, keepCurrent = false) {
  const token = keepCurrent ? (await cookies()).get(SESSION_COOKIE)?.value : undefined;
  await db.delete(schema.sessions).where(token
    ? and(eq(schema.sessions.userId, userId), ne(schema.sessions.tokenHash, tokenHash(token)))
    : eq(schema.sessions.userId, userId));
}

export const loadSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db.select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions).innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(and(eq(schema.sessions.tokenHash, tokenHash(token)), gt(schema.sessions.expiresAt, new Date())));
  // Date de dernière activité, écrite au plus toutes les 5 minutes
  if (row && Date.now() - row.session.lastSeenAt.getTime() > 300_000) {
    await db.update(schema.sessions).set({ lastSeenAt: new Date() }).where(eq(schema.sessions.tokenHash, row.session.tokenHash));
    if (!row.session.mfaPending) await recordVisit(row.user.id).catch((error) => console.error("dernière visite non enregistrée", error));
  }
  return row ?? null;
});

/** Pendant un « voir comme », le compte vu, avec qui regarde : tout le reste du site lit `viewing` pour rester en lecture seule. */
export type Viewing = { by: string; byName: string; impersonationId: string; expiresAt: Date; reason: string };
export type SessionUser = User & { viewing?: Viewing };

/** Un compte suspendu, banni, en cours de suppression ou au mot de passe provisoire expiré n'entre pas, même avec une session. */
const canEnter = (user: User) => user.status === "active" && accessRefusal(user) === null;

/** Aperçu en cours pour cette session d'administrateur : jeton du cookie, lié à la session, non terminé, non expiré. */
const activeView = cache(async (sessionHash: string, admin: User) => {
  if (admin.role !== "admin") return null;
  const token = (await cookies()).get(VIEW_COOKIE)?.value;
  if (!token) return null;
  const { impersonations, users } = schema;
  const [row] = await db.select({ view: impersonations, target: users }).from(impersonations).innerJoin(users, eq(impersonations.targetId, users.id))
    .where(and(eq(impersonations.tokenHash, tokenHash(token)), eq(impersonations.adminSessionHash, sessionHash), eq(impersonations.adminId, admin.id), isNull(impersonations.endedAt), gt(impersonations.expiresAt, new Date())));
  if (!row || !canEnter(row.target) || row.target.role === "admin") return null;
  return row;
});

export async function currentUser(): Promise<SessionUser | null> {
  const row = await loadSession();
  if (!row || row.session.mfaPending || !canEnter(row.user)) return null;
  const view = await activeView(row.session.tokenHash, row.user);
  if (view) return { ...view.target, viewing: { by: row.user.id, byName: row.user.name, impersonationId: view.view.id, expiresAt: view.view.expiresAt, reason: view.view.reason } };
  return row.user;
}

/** L'administrateur réel derrière un aperçu (ou le compte connecté). Sert à la fin du voir comme et au bandeau. */
export async function realUser(): Promise<User | null> {
  const row = await loadSession();
  return row && !row.session.mfaPending && canEnter(row.user) ? row.user : null;
}

/** Pendant un aperçu, aucune écriture : une action serveur (en-tête Next-Action) est refusée ici, en plus du proxy. */
async function refuseWriteWhileViewing(user: SessionUser) {
  if (!user.viewing) return;
  const store = await headers();
  if (store.get("next-action")) throw new Error("Aperçu en lecture seule");
}

/** Connecté, même avec un mot de passe provisoire : réservé à la page Mon compte. */
export async function requireUserAny(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  await refuseWriteWhileViewing(user);
  return user;
}

// Chaque page, action et route appelle ces gardes : le proxy ne porte aucune autorisation
// (une faille comme CVE-2025-29927 permettait justement de contourner le middleware).
export async function requireUser(): Promise<SessionUser> {
  const user = await requireUserAny();
  if (user.mustChangePassword) redirect("/parametres");
  if (user.termsVersion !== TERMS_VERSION) redirect("/accepter-cgu");
  if (needsStrongAuth(user.role) && !(await hasSecondFactor(user))) redirect("/parametres?securite=1");
  if (!user.onboardedAt && user.role !== "admin" && user.role !== "teacher") redirect("/bienvenue");
  return user;
}

export const needsStrongAuth = (role: string) => role === "admin" || role === "delegate";

/** Un compte qui modère doit avoir un second facteur : son mot de passe seul ne suffit pas à publier. */
export async function hasSecondFactor(user: Pick<User, "id" | "totpEnabled">) {
  if (user.totpEnabled) return true;
  const [key] = await db.select({ id: schema.passkeys.credentialId }).from(schema.passkeys).where(eq(schema.passkeys.userId, user.id)).limit(1);
  return Boolean(key);
}

/** Administrateur ou délégué. Le droit sur chaque document se vérifie ensuite avec canModerate. */
export async function requireModerator(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "delegate") notFound();
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin" || user.viewing) notFound();
  return user;
}

/** Le second facteur vient d'être redonné : vaut pour cette session seulement, pas pour les autres appareils. */
export async function markStepUp() {
  const row = await loadSession();
  if (row) await db.update(schema.sessions).set({ stepUpAt: new Date() }).where(eq(schema.sessions.tokenHash, row.session.tokenHash));
}

/** Null si la preuve est fraîche ; sinon ce que le compte peut présenter pour la redonner. */
export async function missingStepUp(user: Pick<User, "id" | "totpEnabled">, windowMs?: number): Promise<StepUpRequired | null> {
  const row = await loadSession();
  if (isStepUpFresh(row?.session.stepUpAt, Date.now(), windowMs)) return null;
  const [key] = await db.select({ id: schema.passkeys.credentialId }).from(schema.passkeys).where(eq(schema.passkeys.userId, user.id)).limit(1);
  return { stepUp: { totp: user.totpEnabled, passkey: Boolean(key) } };
}

/**
 * Actions sensibles : un cookie volé ou un poste laissé ouvert ne suffit pas. Un admin sans aucun second facteur
 * est renvoyé vers son activation par requireUser. À l'appel : if ("stepUp" in admin) return admin;
 */
export async function requireFreshAdmin(): Promise<User | StepUpRequired> {
  const admin = await requireAdmin();
  return await missingStepUp(admin) ?? admin;
}

/**
 * Actions critiques (nommer un admin, bannir, supprimer, voir comme, vider la corbeille, fermer les inscriptions) :
 * second facteur donné il y a moins de 2 minutes. La vérification réussie rejoue l'action sans second clic.
 */
export async function requireCriticalAdmin(): Promise<User | StepUpRequired> {
  const admin = await requireAdmin();
  return await missingStepUp(admin, STEP_UP_CRITICAL_MS) ?? admin;
}

/**
 * Ajouter un facteur à un compte qui en a déjà un demande de présenter l'existant, quel que soit le rôle :
 * sinon un cookie volé permettrait d'ajouter sa propre clé d'accès (connexion sans mot de passe, qui survit à un
 * changement de mot de passe), puis de s'en servir comme preuve.
 */
export async function missingStepUpToEnroll(user: Pick<User, "id" | "role" | "totpEnabled">) {
  return await hasSecondFactor(user) ? missingStepUp(user) : null;
}

/** Variante des routes d'API : renvoie null au lieu de rediriger. */
export async function apiAdmin(): Promise<User | null> {
  const user = await currentUser();
  return user && !user.viewing && user.role === "admin" && !user.mustChangePassword && user.termsVersion === TERMS_VERSION && await hasSecondFactor(user) ? user : null;
}

/** Tout compte actif, avec les mêmes conditions que requireUser, mais sans redirection : pour les routes d'API. */
export async function apiMember(): Promise<User | null> {
  const user = await currentUser();
  // Pendant un aperçu, les routes d'API restent fermées : seules les pages se lisent
  return user && !user.viewing && !user.mustChangePassword && user.termsVersion === TERMS_VERSION && (!needsStrongAuth(user.role) || await hasSecondFactor(user)) ? user : null;
}

/** Après une connexion complète : retient l'appareil et prévient en cas de nouveau. */
export async function afterFullLogin(user: Pick<User, "id" | "email" | "trackingConsent" | "prefs">) {
  const store = await cookies();
  const agent = (await headers()).get("user-agent") ?? "";
  const hash = createHash("sha256").update(`${deviceOf(agent)}|${browserOf(agent)}|${/windows|mac os|android|iphone|linux/i.exec(agent)?.[0] ?? ""}`).digest("hex");
  const known = await db.select().from(schema.knownDevices).where(eq(schema.knownDevices.userId, user.id));
  if (known.length && !known.some((d) => d.hash === hash)) {
    await queueMail(user.email, authMails.newDevice(browserOf(agent), deviceOf(agent)));
  }
  await db.insert(schema.knownDevices).values({ userId: user.id, hash }).onConflictDoUpdate({ target: [schema.knownDevices.userId, schema.knownDevices.hash], set: { lastSeenAt: new Date() } });
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  // Le choix de l'utilisateur le suit sur ce nouvel appareil
  if (user.trackingConsent) store.set("campuss-consent", user.trackingConsent, { secure: true, sameSite: "lax", path: "/", maxAge: 183 * 86_400 });
  if (Object.keys(user.prefs ?? {}).length) store.set("campuss-prefs", JSON.stringify(user.prefs), { secure: true, sameSite: "lax", path: "/", maxAge: 365 * 86_400 });
}

// Pur, dans lib/home.ts (testé sans base) : chemin local seulement, l'ancien accueil « / » mène à /accueil
export { safeNext } from "./home";
