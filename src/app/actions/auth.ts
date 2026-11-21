"use server";

import { trackEvent } from "@/lib/product-events";
import { and, eq, isNull, lt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Secret, TOTP } from "otpauth";
import { z } from "zod";
import { afterFullLogin, audit, clientIp, createSession, hasSecondFactor, destroyCurrentSession, loadSession, markStepUp, requireUserAny, revokeSessions, safeNext } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { DEMO_EMAIL, demoFormRefusal, isDemo } from "@/lib/demo";
import type { User } from "@/lib/db/schema";
import { TERMS_VERSION } from "@/lib/db/categories";
import { env } from "@/lib/env";
import { turnstilePassed } from "@/lib/turnstile";
import { creditReferral, recordReferral } from "@/lib/referrals";
import { readTotpSecret } from "@/lib/totp-secret";
import { notifyAdmins, queueMail } from "@/lib/mail";
import { adminMails, authMails } from "@/lib/mail/catalog";
import { hashPassword, randomToken, strongPasswordProblem, rateClear, rateHit, rateLimited, rateTake, rateTakeAll, safeEqual, tokenHash, verifyPassword } from "@/lib/security";
import type { FormState } from "@/components/action-form";
import { consumeInvitation, domainAllowed, signupRefusal, usableInvitation } from "@/lib/invitations";
import { publicSignupAllowed, studentsOnlyMessage } from "@/lib/domains";
import { accessRefusal } from "@/lib/suspension";
import { getSetting } from "@/lib/site-settings";
import { nameFromEmail } from "@/lib/user-name-rules";
import { alertAdminsDaily } from "@/lib/admin-alert";
import { HOME } from "@/lib/home";

const { users, oneTimeTokens } = schema;

const text = (form: FormData, name: string, max = 1000) => {
  const value = form.get(name);
  return typeof value === "string" ? value.slice(0, max) : "";
};

const emailOf = (form: FormData) => text(form, "email", 254).trim().toLowerCase();

const emailSchema = z.email();

async function verifyTotp(user: User, code: string) {
  const secret = readTotpSecret(user.totpSecret);
  if (!secret) return false;
  const totp = new TOTP({ secret: Secret.fromBase32(secret), period: 30, digits: 6, algorithm: "SHA1" });
  const current = Math.floor(Date.now() / 30_000);
  // Fenêtre ±1 ; un code déjà utilisé ne peut pas être rejoué
  for (const counter of [current - 1, current, current + 1]) {
    if (counter > user.totpLastCounter && safeEqual(totp.generate({ timestamp: counter * 30_000 }), code.replace(/\s/g, ""))) {
      // Condition en base : deux requêtes simultanées avec le même code ne passent pas toutes les deux
      const [won] = await db.update(users).set({ totpLastCounter: counter }).where(and(eq(users.id, user.id), lt(users.totpLastCounter, counter))).returning({ id: users.id });
      return Boolean(won);
    }
  }
  return false;
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = emailOf(form);
  const password = text(form, "password", 256);
  const next = safeNext(text(form, "next"));
  const ip = await clientIp();
  // Limite stricte par couple adresse/IP : un attaquant ne peut pas verrouiller le compte de quelqu'un d'autre.
  // Le plafond par adresse, bien plus haut, freine une attaque distribuée sur un seul compte.
  const keys = [`login:${email}:${ip}`, `login-ip:${ip}`, `login-mail:${email}`];
  // Inscrits avant la vérification : des connexions lancées en parallèle ne dépassent plus les plafonds
  const take = await rateTakeAll([[keys[0], 8, 15], [keys[1], 30, 15], [keys[2], 100, 60]]);
  if (!take.ok) {
    await take.release();
    return { error: "Trop de tentatives. Réessaie dans un quart d’heure." };
  }
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!await verifyPassword(user?.passwordHash, password)) return { error: "Adresse ou mot de passe incorrect." };
  // Seuls les échecs comptent : une connexion réussie ne rapproche pas une salle partagée (même IP) du plafond
  await take.release();
  // Le statut n'est révélé qu'à qui connaît déjà le mot de passe
  const blocked = accessRefusal(user);
  if (blocked) return { error: blocked };
  if (user.status !== "active") {
    return { error: {
      unverified: "Confirme d’abord ton adresse avec le lien reçu par mail.",
      pending: "Ta demande est en attente de validation.",
      rejected: "Ta demande d’accès a été refusée.",
      disabled: "Ce compte est désactivé.",
      banned: "Ce compte est désactivé.",
    }[user.status] };
  }
  await rateClear(keys[0]);
  // Nouveau jeton à chaque connexion : aucune fixation de session possible
  await destroyCurrentSession();
  const secondFactor = await hasSecondFactor(user);
  await createSession(user.id, secondFactor);
  if (secondFactor) redirect(`/login/2fa?next=${encodeURIComponent(next)}`);
  await afterFullLogin(user);
  await audit(user.email, "connexion");
  redirect(next);
}

/**
 * « Entrer dans la démo » : connecte au compte de démonstration, dont les identifiants sont publics. N'existe que sur
 * une instance DEMO_MODE ; sans mot de passe à saisir, des essais ratés ne peuvent pas verrouiller le compte partagé.
 */
export async function enterDemo(): Promise<FormState> {
  if (!isDemo()) return { error: "Indisponible sur ce site." };
  if (!await rateTake(`demo-enter:${await clientIp()}`, 30, 15)) return { error: "Trop de connexions. Réessaie dans un quart d’heure." };
  const [user] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL));
  if (!user || user.status !== "active" || await hasSecondFactor(user)) return { error: "Le compte de démonstration n’est pas prêt. Réessaie dans quelques minutes." };
  await destroyCurrentSession();
  await createSession(user.id, false);
  await afterFullLogin(user);
  redirect(HOME);
}

async function consumeRecoveryCode(user: User, code: string) {
  const [row] = await db.update(schema.recoveryCodes).set({ usedAt: new Date() }).where(and(
    eq(schema.recoveryCodes.userId, user.id), eq(schema.recoveryCodes.codeHash, tokenHash(code.trim().toLowerCase())), isNull(schema.recoveryCodes.usedAt),
  )).returning();
  return Boolean(row);
}

export async function submitTotp(_: FormState, form: FormData): Promise<FormState> {
  const row = await loadSession();
  const next = safeNext(text(form, "next"));
  if (!row?.session.mfaPending) redirect("/login");
  const key = `totp:${row.user.id}`;
  // Inscrit avant d'être jugé : une rafale de requêtes parallèles ne multiplie pas les essais
  if (!await rateTake(key, 6, 15)) return { error: "Trop d’essais. Réessaie plus tard." };
  const code = text(form, "code", 20);
  const viaRecovery = /^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i.test(code.trim()) && await consumeRecoveryCode(row.user, code);
  if (!viaRecovery && !await verifyTotp(row.user, code)) return { error: "Code incorrect." };
  if (viaRecovery) await queueMail(row.user.email, authMails.recoveryCodeUsed());
  await rateClear(key);
  await destroyCurrentSession();
  await createSession(row.user.id, false, !viaRecovery);
  await afterFullLogin(row.user);
  await audit(row.user.email, viaRecovery ? "connexion_code_secours" : "connexion");
  redirect(next);
}

/**
 * Second facteur perdu (ou activé par erreur) : à l'étape 2FA, le mot de passe a déjà été vérifié. On enregistre une
 * demande pour l'administration et on prévient l'adresse du compte ; rien n'est réinitialisé automatiquement.
 */
export async function requestMfaReset(_: FormState, form: FormData): Promise<FormState> {
  const demo = demoFormRefusal();
  if (demo) return demo;
  const row = await loadSession();
  if (!row?.session.mfaPending) redirect("/login");
  const ip = await clientIp();
  const userKey = `mfa-reset:${row.user.id}`;
  const ipKey = `mfa-reset-ip:${ip}`;
  if (await rateLimited(userKey, 2, 1440) || await rateLimited(ipKey, 5, 1440)) return { error: "Demande déjà envoyée. L’équipe te répondra par mail." };
  await rateHit(userKey);
  await rateHit(ipKey);
  const reason = text(form, "reason", 600).split(/\s+/).join(" ").trim().slice(0, 500);
  const [open] = await db.select({ id: schema.mfaResetRequests.id }).from(schema.mfaResetRequests)
    .where(and(eq(schema.mfaResetRequests.userId, row.user.id), eq(schema.mfaResetRequests.status, "open")));
  if (!open) {
    await db.insert(schema.mfaResetRequests).values({ userId: row.user.id, reason, ip: ip.slice(0, 64) });
    await alertAdminsDaily(`mfa-reset:${row.user.id}`, {
      title: "Demande de réinitialisation du second facteur",
      body: `${row.user.name} <${row.user.email}> a perdu son second facteur. Écris-lui à l’adresse du compte depuis ta propre messagerie et attends sa réponse avant de réinitialiser depuis sa fiche (l’adresse d’envoi du site n’est pas lue).`,
      href: `/admin/personnes/${row.user.id}?vue=acces`,
    });
  }
  await queueMail(row.user.email, authMails.mfaResetRequested());
  await audit(row.user.email, "demande_reinitialisation_2fa");
  return { ok: "Demande envoyée. L’équipe va t’écrire à l’adresse de ton compte : réponds-lui pour confirmer que c’est bien toi. Elle réinitialisera ensuite ton second facteur." };
}

/**
 * Redonne le second facteur pour la session en cours. Mêmes essais comptés qu'à la connexion, et pas de code de
 * secours : n'importe quelle session peut en générer, ils ne prouveraient rien ici.
 */
export async function confirmStepUp(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUserAny();
  if (!user.totpEnabled) return { error: "Aucune application d’authentification sur ce compte." };
  const key = `totp:${user.id}`;
  if (!await rateTake(key, 6, 15)) return { error: "Trop d’essais. Réessaie dans un quart d’heure." };
  if (!await verifyTotp(user, text(form, "code", 20))) return { error: "Code incorrect ou déjà utilisé. Attends le suivant." };
  await rateClear(key);
  await markStepUp();
  await audit(user.email, "double_authentification_redonnée");
  return { ok: "Confirmé." };
}

export async function logout() {
  await destroyCurrentSession();
  redirect("/login");
}

const DONE = "Si cette adresse peut être utilisée, tu vas recevoir un mail pour la confirmer et choisir ton mot de passe. Ta demande sera ensuite examinée, et la décision te sera envoyée par mail.";

async function createOneTime(userId: string, purpose: "verify" | "reset" | "email", hours: number) {
  await db.delete(oneTimeTokens).where(and(eq(oneTimeTokens.userId, userId), eq(oneTimeTokens.purpose, purpose)));
  const token = randomToken();
  await db.insert(oneTimeTokens).values({ tokenHash: tokenHash(token), userId, purpose, expiresAt: new Date(Date.now() + hours * 3_600_000) });
  return token;
}

// Aucun texte saisi par le demandeur dans ce mail : le formulaire ne doit pas servir à spammer une adresse tierce
async function sendVerification(user: Pick<User, "id" | "email">) {
  const token = await createOneTime(user.id, "verify", 72);
  await queueMail(user.email, authMails.verifyEmail(token));
}

async function notifyNewRequest(user: Pick<User, "name" | "email" | "message" | "programId" | "level">) {
  const [program] = user.programId ? await db.select().from(schema.programs).where(eq(schema.programs.id, user.programId)) : [];
  await notifyAdmins(adminMails.newAccessRequest({ name: user.name, email: user.email, program: program?.name ?? null, level: user.level, message: user.message }));
}

const cleanName = (form: FormData) => text(form, "name", 200).split(/\s+/).join(" ").trim().slice(0, 80);
/** Adresse prenom_nom@ d'un domaine de NAMED_EMAIL_DOMAINS : le nom vient de l'adresse, pas du formulaire. Sinon, le nom saisi. */
const accountName = (form: FormData, email: string) => nameFromEmail(email, env.namedEmailDomains) ?? cleanName(form);

/**
 * Le mot de passe n'est choisi qu'après la preuve de possession de l'adresse : quelqu'un qui s'inscrirait à
 * l'avance avec l'adresse d'une autre personne ne connaîtra jamais le mot de passe du compte (pré-détournement).
 */
export async function register(_: FormState, form: FormData): Promise<FormState> {
  const demo = demoFormRefusal();
  if (demo) return demo;
  const email = emailOf(form);
  const name = accountName(form, email);
  const message = text(form, "message", 1000).split(/\s+/).join(" ").trim().slice(0, 500);
  const level = Number(text(form, "level", 2));
  if (text(form, "website")) return { ok: DONE }; // champ invisible : seuls les robots le remplissent
  if (!env.smtpEnabled) return { error: "Les inscriptions ouvriront dès que l’envoi de mails sera configuré." };
  const mode = await getSetting("registration.mode");
  if (mode === "closed") return { error: (await getSetting("registration.closedMessage")) || "Les inscriptions sont fermées pour le moment." };
  if (mode === "invite") return { error: "Les inscriptions se font sur invitation : utilise le lien reçu." };
  const ipKey = `register-ip:${await clientIp()}`;
  const mailKey = `register-mail:${email}`;
  if (await rateLimited(ipKey, 5, 60)) return { error: "Trop de demandes. Réessaie plus tard." };
  // Captcha (seulement si TURNSTILE_SITE_KEY et TURNSTILE_SECRET_KEY sont posées) : vérifié ici, jamais par le navigateur seul
  if (!(await turnstilePassed(text(form, "cf-turnstile-response", 2048), await clientIp()))) return { error: "La vérification anti-robot a échoué. Réessaie." };
  if (name.length < 2) return { error: "Indique ton nom." };
  if (!emailSchema.safeParse(email).success) return { error: "Cette adresse mail n’est pas valide." };
  // Liste blanche des domaines étudiants : décidé sur le seul domaine, avant toute recherche de compte (aucune énumération)
  const studentDomains = await getSetting("registration.autoApproveDomains");
  if (!publicSignupAllowed(email, studentDomains, await getSetting("registration.reviewedDomains"))) return { error: studentsOnlyMessage(studentDomains) };
  const [program] = await db.select().from(schema.programs).where(and(eq(schema.programs.slug, text(form, "program", 40)), eq(schema.programs.active, true)));
  if (!program) return { error: "Choisis ta licence." };
  if (form.get("terms") !== "on") return { error: "Accepte les conditions d’utilisation pour continuer." };
  if (![1, 2, 3].includes(level)) return { error: "Choisis ton année." };
  const refusal = await signupRefusal(email);
  if (refusal) return { error: refusal };
  await rateHit(ipKey);
  // Dépassé : même réponse, mais plus aucun mail vers cette adresse
  if (await rateLimited(mailKey, 3, 60)) return { ok: DONE };
  await rateHit(mailKey);

  const placeholder = await hashPassword(randomToken());
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    // Même réponse qu'une nouvelle inscription : la page ne révèle pas qui possède un compte
    if (existing.status === "unverified") await sendVerification(existing);
    else if (existing.status === "active") {
      await queueMail(email, authMails.alreadyRegistered());
    }
    return { ok: DONE };
  }
  // onConflict : deux inscriptions simultanées ne provoquent ni erreur révélatrice ni doublon
  const [user] = await db.insert(users).values({
    email, name, message, passwordHash: placeholder, status: "unverified", programId: program.id, level, termsVersion: TERMS_VERSION, termsAcceptedAt: new Date(),
  }).onConflictDoNothing().returning();
  if (user) {
    await sendVerification(user);
    await audit(email, "inscription");
    await trackEvent("signup", { id: user.id, trackingConsent: user.trackingConsent });
    // Le parrainage ne change rien à la validation, et son échec ne doit pas faire échouer une inscription
    await recordReferral(form.get("ref"), user.id).catch((error) => console.error("parrainage non enregistré", error));
  }
  return { ok: DONE };
}

async function takeToken(token: string, purpose: "verify" | "reset" | "email") {
  const [row] = await db.select().from(oneTimeTokens).where(and(
    eq(oneTimeTokens.tokenHash, tokenHash(token)), eq(oneTimeTokens.purpose, purpose)));
  return row && row.expiresAt > new Date() ? row : null;
}

export async function tokenIsValid(token: string, purpose: "verify" | "reset") {
  return Boolean(await takeToken(token, purpose));
}

/** Comparaison exacte du domaine : etu.exemple.fr.autre.com ou faux-etu.exemple.fr ne passent pas. */
async function isAutoApproved(email: string) {
  return (await getSetting("registration.autoApproveDomains")).includes(email.slice(email.lastIndexOf("@") + 1));
}

/** Une invitation encore valable saute la validation : la boîte mail vient d'être prouvée. */
async function invitedAndValid(invitationId: string | null) {
  if (!invitationId) return false;
  const [inv] = await db.select({ revokedAt: schema.invitations.revokedAt }).from(schema.invitations).where(eq(schema.invitations.id, invitationId));
  return Boolean(inv && !inv.revokedAt);
}

export async function verifyEmail(_: FormState, form: FormData): Promise<FormState> {
  const row = await takeToken(text(form, "token", 100), "verify");
  if (!row) return { error: "Ce lien n’est plus valide. Inscris-toi de nouveau pour en recevoir un autre." };
  const [current] = await db.select().from(users).where(eq(users.id, row.userId));
  const name = accountName(form, current.email);
  if (name.length < 2) return { error: "Indique ton nom." };
  const password = text(form, "password", 300);
  const problem = await strongPasswordProblem(password, current.email);
  if (problem) return { error: problem };
  await db.delete(oneTimeTokens).where(eq(oneTimeTokens.tokenHash, row.tokenHash));
  const [user] = await db.update(users).set({ status: "pending", name, passwordHash: await hashPassword(password) })
    .where(and(eq(users.id, row.userId), eq(users.status, "unverified"))).returning();
  if (!user) return { ok: "Ton adresse est déjà confirmée." };
  if (await isAutoApproved(user.email) || await invitedAndValid(user.invitationId)) {
    await db.update(users).set({ status: "active" }).where(eq(users.id, user.id));
    await audit(user.email, "compte_auto_accepté");
    await creditReferral(user.id).catch((error) => console.error("parrainage non crédité", error));
    return { ok: "Ton adresse étudiante est confirmée : ton compte est actif. Tu peux te connecter." };
  }
  await notifyNewRequest(user);
  return { ok: "Ta demande a été transmise. Tu recevras un mail dès qu’elle aura été examinée." };
}

export async function forgotPassword(_: FormState, form: FormData): Promise<FormState> {
  const demo = demoFormRefusal();
  if (demo) return demo;
  const email = emailOf(form);
  const keys = [`forgot:${email}`, `forgot-ip:${await clientIp()}`];
  // Inscrit avant d'envoyer : une rafale de demandes n'inonde pas une boîte de liens
  const take = await rateTakeAll([[keys[0], 3, 60], [keys[1], 10, 60]]);
  if (!take.ok) await take.release();
  else {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (user?.status === "active") {
      const token = await createOneTime(user.id, "reset", 1);
      await queueMail(user.email, authMails.resetPassword(token));
    }
  }
  return { ok: "Si un compte actif correspond à cette adresse, un lien vient de lui être envoyé." };
}

export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const demo = demoFormRefusal();
  if (demo) return demo;
  const row = await takeToken(text(form, "token", 100), "reset");
  if (!row) return { error: "Ce lien a expiré. Demandes-en un nouveau." };
  const [user] = await db.select().from(users).where(eq(users.id, row.userId));
  const password = text(form, "password", 300);
  const problem = await strongPasswordProblem(password, user.email);
  if (problem) return { error: problem };
  await db.update(users).set({ passwordHash: await hashPassword(password), mustChangePassword: false }).where(eq(users.id, user.id));
  await db.delete(oneTimeTokens).where(eq(oneTimeTokens.tokenHash, row.tokenHash));
  await revokeSessions(user.id);
  await audit(user.email, "mot_de_passe_réinitialisé");
  redirect("/login");
}

export async function acceptTerms(form: FormData) {
  const user = await requireUserAny();
  if (form.get("terms") === "on") await db.update(users).set({ termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() }).where(eq(users.id, user.id));
  redirect(HOME);
}

/**
 * Inscription par invitation. Nominative : le lien est arrivé dans cette boîte, elle est donc prouvée et le compte est
 * actif tout de suite. Lien ouvert : l'adresse doit encore être confirmée, mais la validation par l'équipe est sautée.
 */
export async function acceptInvitation(_: FormState, form: FormData): Promise<FormState> {
  const demo = demoFormRefusal();
  if (demo) return demo;
  const ipKey = `invite-ip:${await clientIp()}`;
  if (await rateLimited(ipKey, 10, 60)) return { error: "Trop de demandes. Réessaie plus tard." };
  await rateHit(ipKey);
  const inv = await usableInvitation(text(form, "token", 100));
  if (!inv) return { error: "Cette invitation n’est plus valable. Demande un nouveau lien." };
  if (form.get("terms") !== "on") return { error: "Accepte les conditions d’utilisation pour continuer." };
  const email = inv.email ?? emailOf(form);
  if (!emailSchema.safeParse(email).success) return { error: "Cette adresse mail n’est pas valide." };
  const name = accountName(form, email);
  if (name.length < 2) return { error: "Indique ton nom." };
  if (!domainAllowed(inv, email)) return { error: `Utilise ton adresse @${inv.allowedDomain}.` };
  const refusal = await signupRefusal(email);
  if (refusal) return { error: refusal };
  const level = inv.level ?? Number(text(form, "level", 2));
  if (![1, 2, 3].includes(level)) return { error: "Choisis ton année." };
  const [program] = inv.programId
    ? await db.select().from(schema.programs).where(eq(schema.programs.id, inv.programId))
    : await db.select().from(schema.programs).where(and(eq(schema.programs.slug, text(form, "program", 40)), eq(schema.programs.active, true)));
  if (!program) return { error: "Choisis ta licence." };
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) return inv.email ? { error: "Cette adresse a déjà un compte : connecte-toi." } : { ok: DONE };

  if (inv.email) {
    const password = text(form, "password", 300);
    const problem = await strongPasswordProblem(password, email);
    if (problem) return { error: problem };
    if (!await consumeInvitation(inv.id)) return { error: "Cette invitation n’est plus valable. Demande un nouveau lien." };
    const [user] = await db.insert(users).values({
      email, name, passwordHash: await hashPassword(password), status: "active", role: inv.role, programId: program.id, level,
      termsVersion: TERMS_VERSION, termsAcceptedAt: new Date(), invitedBy: inv.createdBy, invitationId: inv.id,
    }).onConflictDoNothing().returning();
    if (!user) return { error: "Cette adresse a déjà un compte : connecte-toi." };
    await audit(email, "inscription_invitation");
    await trackEvent("signup", { id: user.id, trackingConsent: user.trackingConsent });
    await destroyCurrentSession();
    await createSession(user.id);
    await afterFullLogin(user);
    redirect(HOME);
  }

  if (!await consumeInvitation(inv.id)) return { error: "Cette invitation n’est plus valable. Demande un nouveau lien." };
  const [user] = await db.insert(users).values({
    email, name, passwordHash: await hashPassword(randomToken()), status: "unverified", role: inv.role === "teacher" ? "member" : inv.role, programId: program.id, level,
    termsVersion: TERMS_VERSION, termsAcceptedAt: new Date(), invitedBy: inv.createdBy, invitationId: inv.id,
  }).onConflictDoNothing().returning();
  if (user) {
    await sendVerification(user);
    await audit(email, "inscription_invitation");
    await trackEvent("signup", { id: user.id, trackingConsent: user.trackingConsent });
  }
  return { ok: "Un lien vient d’être envoyé à ton adresse : ouvre-le pour choisir ton mot de passe. Ton compte sera actif tout de suite." };
}
