"use server";

import { and, eq, lt } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Secret, TOTP } from "otpauth";
import { z } from "zod";
import { audit, hasSecondFactor, currentUser, destroyCurrentSession, missingStepUp, missingStepUpToEnroll, requireUserAny, revokeSessions } from "@/lib/auth";
import type { StepUpRequired } from "@/lib/step-up";
import { db, schema } from "@/lib/db";
import { DEMO_REFUSAL, demoFormRefusal, isDemo } from "@/lib/demo";
import type { User } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { deleteUserAccount } from "@/lib/purge";
import { readTotpSecret, sealTotpSecret } from "@/lib/totp-secret";
import { queueMail } from "@/lib/mail";
import { accountMails } from "@/lib/mail/catalog";
import { hashPassword, randomToken, strongPasswordProblem, rateHit, rateLimited, rateTake, safeEqual, tokenHash, verifyPassword } from "@/lib/security";
import type { FormState } from "@/components/action-form";

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

/**
 * Mot de passe redemandé dans une session ouverte : essais bornés par compte. Sans borne, un cookie volé suffisait
 * à deviner le mot de passe en ligne, puis à changer l'adresse ou à retirer le second facteur.
 */
async function passwordRefusal(user: User, form: FormData, wrong = "Mot de passe incorrect.") {
  if (!await rateTake(`password-check:${user.id}`, 10, 60)) return "Trop d’essais. Réessaie dans une heure.";
  return await verifyPassword(user.passwordHash, text(form, "current", 256)) ? null : wrong;
}

/**
 * Les codes ne sont montrés qu'une fois. En générer de nouveaux invalide les anciens. Ils ouvrent le compte à la place
 * du second facteur : il faut donc l'avoir redonné récemment, un cookie volé ne suffit pas à s'en fabriquer.
 */
export async function createRecoveryCodes(): Promise<string[] | StepUpRequired> {
  if (isDemo()) throw new Error(DEMO_REFUSAL);
  const user = await requireUserAny();
  if (!await hasSecondFactor(user)) throw new Error("second facteur requis");
  const missing = await missingStepUp(user);
  if (missing) return missing;
  const codes = Array.from({ length: 10 }, () => randomBytes(9).toString("hex").slice(0, 12).replace(/(.{4})(.{4})(.{4})/, "$1-$2-$3"));
  await db.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, user.id));
  await db.insert(schema.recoveryCodes).values(codes.map((code) => ({ userId: user.id, codeHash: tokenHash(code) })));
  await audit(user.email, "codes_secours_générés");
  return codes;
}

export async function revokeOneSession(form: FormData) {
  // Démonstration : la page explique le refus ; déconnecter les autres appareils couperait les autres visiteurs
  if (isDemo()) redirect("/parametres/compte");
  const user = await requireUserAny();
  await db.delete(schema.sessions).where(and(eq(schema.sessions.userId, user.id), eq(schema.sessions.tokenHash, text(form, "session", 64))));
  redirect("/parametres/compte");
}

export async function requestEmailChange(_: FormState, form: FormData): Promise<FormState> {
  const demo = demoFormRefusal();
  if (demo) return demo;
  const user = await requireUserAny();
  const email = emailOf(form);
  const wrong = await passwordRefusal(user, form);
  if (wrong) return { error: wrong };
  if (!emailSchema.safeParse(email).success) return { error: "Cette adresse mail n’est pas valide." };
  // La confirmation par mail reste obligatoire : sans envoi de mails, rien ne change et on le dit
  if (!env.smtpEnabled) return { error: "L’envoi de mails n’est pas encore en service : le changement d’adresse est impossible pour l’instant. Écris à l’équipe depuis la page Aide." };
  const key = `email-change:${user.id}`;
  if (await rateLimited(key, 3, 60)) return { error: "Trop de demandes. Réessaie dans une heure." };
  await rateHit(key);
  // Réponse identique si l'adresse est déjà prise : pas d'indice sur les comptes existants
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!taken) {
    await db.update(users).set({ pendingEmail: email }).where(eq(users.id, user.id));
    const token = await createOneTime(user.id, "email", 24);
    await queueMail(email, accountMails.confirmNewEmail(token, 24));
    await queueMail(user.email, accountMails.emailChangeRequested());
  }
  return { ok: "Étape suivante : ouvre le mail envoyé à ta nouvelle adresse (regarde aussi les indésirables) et clique sur le lien dans les 24 heures. Ton adresse actuelle reste valable d’ici là." };
}

export async function confirmEmailChange(_: FormState, form: FormData): Promise<FormState> {
  const demo = demoFormRefusal();
  if (demo) return demo;
  const row = await takeToken(text(form, "token", 100), "email");
  if (!row) return { error: "Ce lien n’est plus valide." };
  const [user] = await db.select().from(users).where(eq(users.id, row.userId));
  await db.delete(oneTimeTokens).where(eq(oneTimeTokens.tokenHash, row.tokenHash));
  if (!user?.pendingEmail) return { error: "Aucun changement en attente." };
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, user.pendingEmail));
  if (taken) return { error: "Cette adresse est déjà utilisée." };
  await db.update(users).set({ email: user.pendingEmail, pendingEmail: null }).where(eq(users.id, user.id));
  await revokeSessions(user.id);
  await audit(user.pendingEmail, "adresse_modifiée");
  return { ok: "Adresse modifiée. Reconnecte-toi avec la nouvelle." };
}

async function createOneTime(userId: string, purpose: "verify" | "reset" | "email", hours: number) {
  await db.delete(oneTimeTokens).where(and(eq(oneTimeTokens.userId, userId), eq(oneTimeTokens.purpose, purpose)));
  const token = randomToken();
  await db.insert(oneTimeTokens).values({ tokenHash: tokenHash(token), userId, purpose, expiresAt: new Date(Date.now() + hours * 3_600_000) });
  return token;
}

async function takeToken(token: string, purpose: "verify" | "reset" | "email") {
  const [row] = await db.select().from(oneTimeTokens).where(and(
    eq(oneTimeTokens.tokenHash, tokenHash(token)), eq(oneTimeTokens.purpose, purpose)));
  return row && row.expiresAt > new Date() ? row : null;
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const demo = demoFormRefusal();
  if (demo) return demo;
  const user = await requireUserAny();
  const wrong = await passwordRefusal(user, form, "Mot de passe actuel incorrect.");
  if (wrong) return { error: wrong };
  const password = text(form, "password", 300);
  const problem = await strongPasswordProblem(password, user.email);
  if (problem) return { error: problem };
  await db.update(users).set({ passwordHash: await hashPassword(password), mustChangePassword: false }).where(eq(users.id, user.id));
  await revokeSessions(user.id, true);
  // Le mot de passe initial n'a plus aucune raison de rester sur le disque
  if (user.mustChangePassword) await rm(env.adminPasswordFile, { force: true }).catch(() => undefined);
  await audit(user.email, "mot_de_passe_modifié");
  return { ok: "Mot de passe modifié. Tes autres appareils ont été déconnectés." };
}

export async function changeMyLevel(form: FormData) {
  const user = await requireUserAny();
  const level = Number(text(form, "level", 2));
  if ([1, 2, 3].includes(level)) await db.update(users).set({ level }).where(eq(users.id, user.id));
  redirect("/parametres/compte");
}

export async function startTotp() {
  if (isDemo()) redirect("/parametres/compte");
  const user = await requireUserAny();
  if (!user.totpEnabled) await db.update(users).set({ totpSecret: sealTotpSecret(new Secret({ size: 20 }).base32) }).where(eq(users.id, user.id));
  redirect("/parametres/compte");
}

export async function confirmTotp(_: FormState, form: FormData): Promise<FormState> {
  const demo = demoFormRefusal();
  if (demo) return demo;
  const user = await requireUserAny();
  const missing = await missingStepUpToEnroll(user);
  if (missing) return missing;
  if (!await verifyTotp(user, text(form, "code", 12))) return { error: "Code incorrect, réessaie." };
  await db.update(users).set({ totpEnabled: true }).where(eq(users.id, user.id));
  await audit(user.email, "2fa_activée");
  revalidatePath("/parametres/compte");
  return { ok: "Double authentification activée." };
}

export async function disableTotp(_: FormState, form: FormData): Promise<FormState> {
  const demo = demoFormRefusal();
  if (demo) return demo;
  const user = await requireUserAny();
  // Retirer le second facteur demande de le présenter : le mot de passe seul (ou un cookie volé) ne suffit pas
  const missing = await missingStepUp(user);
  if (missing) return missing;
  const wrong = await passwordRefusal(user, form);
  if (wrong) return { error: wrong };
  await db.update(users).set({ totpEnabled: false, totpSecret: null }).where(eq(users.id, user.id));
  await audit(user.email, "2fa_désactivée");
  revalidatePath("/parametres/compte");
  return { ok: "Double authentification désactivée." };
}

export async function revokeOtherSessions(): Promise<void> {
  // Démonstration : la page explique le refus ; déconnecter les autres appareils couperait les autres visiteurs
  if (isDemo()) redirect("/parametres/compte");
  const user = await currentUser();
  if (user && !user.viewing) await revokeSessions(user.id, true);
  redirect("/parametres/compte");
}

export async function deleteOwnAccount(_: FormState, form: FormData): Promise<FormState> {
  const demo = demoFormRefusal();
  if (demo) return demo;
  const user = await requireUserAny();
  const wrong = await passwordRefusal(user, form);
  if (wrong) return { error: wrong };
  if (user.role === "admin") {
    const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active")));
    if (admins.length <= 1) return { error: "C’est le seul compte administrateur : il ne peut pas être supprimé." };
  }
  await audit("compte supprimé", "compte_supprimé");
  await destroyCurrentSession();
  await deleteUserAccount(user);
  redirect("/login");
}
