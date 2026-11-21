"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { adminFor, isStepUp, reasonOf, shownReason, targetOf, type AdminResult } from "@/lib/admin-ops";
import { guardAdminChange } from "@/lib/admin-guards";
import { auditAction } from "@/lib/audit";
import { loadSession, revokeSessions } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { emailHmac } from "@/lib/domains";
import { env } from "@/lib/env";
import { startView } from "@/lib/impersonation";
import { queueMail } from "@/lib/mail";
import { accessMails } from "@/lib/mail/catalog";
import { notify } from "@/lib/notify";
import { hashPassword, randomToken, tokenHash } from "@/lib/security";
import { forgetAllShellCounters } from "@/lib/shell-cache";
import { provisionalPassword, suspensionEnd, SUSPENSION_PRESETS } from "@/lib/suspension";
import { trashDocument } from "@/lib/trash";
import { deleteUserAccount } from "@/lib/purge";
import { HOME } from "@/lib/home";

const { users } = schema;
const refresh = (id?: string) => { revalidatePath("/admin/personnes"); if (id) revalidatePath(`/admin/personnes/${id}`); };
const label = (u: Pick<User, "id" | "name">) => ({ type: "user" as const, id: u.id, label: u.name });

/** Toute mesure de sécurité sur un compte prévient la personne : dans le site et par mail. */
async function warn(target: Pick<User, "id" | "email" | "name">, title: string, text: string) {
  await notify(target.id, { kind: "alert", title, body: text.slice(0, 300), href: "/parametres" });
  await queueMail(target.email, accessMails.warning(target.name, title, text));
}

/* ------------------------------------------------------------------ Rôle */

export async function setRole(id: string, role: "member" | "delegate" | "teacher" | "admin", reason: string, warnTarget = false): Promise<AdminResult> {
  const parsedRole = z.enum(["member", "delegate", "teacher", "admin"]).safeParse(role);
  if (!parsedRole.success) return { error: "Rôle inconnu." };
  const preview = await targetOf(id, { id: "" });
  // Nommer ou retirer un admin est critique, et réservé au propriétaire du site
  const critical = role === "admin" || preview?.role === "admin";
  const admin = await adminFor(critical ? "critical" : "sensitive");
  if (isStepUp(admin)) return admin;
  const target = await targetOf(id, admin);
  if (!target) return { error: "Compte introuvable." };
  const motive = reasonOf(reason);
  if (target.status !== "active") return { error: "Le compte doit être actif." };
  if (critical && !admin.isOwner) return { error: "Seul le propriétaire du site nomme ou retire un administrateur." };
  if (target.role === "admin" && role !== "admin") {
    const refusal = await guardAdminChange(target.id, "demote");
    if (refusal) return { error: refusal };
  }
  if (target.role === role) return {};
  await db.update(users).set({ role }).where(eq(users.id, target.id));
  await auditAction(admin, { action: critical ? "role.admin" : "role.change", target: label(target), reason: motive, before: { role: target.role }, after: { role, prevenu: warnTarget } });
  if (warnTarget) await warn(target, "Ton rôle a changé", `L’équipe a changé ton rôle sur ${env.siteName}.${shownReason(motive) ? ` Motif : ${motive}` : ""}`);
  forgetAllShellCounters();
  refresh(target.id);
  return {};
}

/* ------------------------------------------------------------------ Suspension datée */

export async function suspendUsers(list: string[], preset: keyof typeof SUSPENSION_PRESETS | "date", date: string | null, reason: string, message: string): Promise<AdminResult<number>> {
  const admin = await adminFor("sensitive");
  if (isStepUp(admin)) return admin;
  const parsed = z.array(z.uuid()).min(1).max(200).safeParse(list);
  if (!parsed.success) return { error: "Sélection invalide." };
  const motive = reasonOf(reason);
  const until = suspensionEnd(preset, date);
  if (!until) return { error: "Choisis une date à venir." };
  const shown = message.trim().slice(0, 500) || null;
  let n = 0;
  for (const target of await db.select().from(users).where(inArray(users.id, parsed.data))) {
    if (target.id === admin.id) continue;
    const refusal = await guardAdminChange(target.id, "disable");
    if (refusal) { if (parsed.data.length === 1) return { error: refusal }; continue; }
    await db.update(users).set({ suspendedUntil: until, suspensionReason: motive, suspensionMessage: shown }).where(eq(users.id, target.id));
    await revokeSessions(target.id);
    await auditAction(admin, { action: "compte.suspendu", target: label(target), reason: motive, before: { suspendedUntil: target.suspendedUntil }, after: { suspendedUntil: until, message: shown } });
    const when = until.toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
    await queueMail(target.email, accessMails.suspended(target.name, when, shown || null));
    n++;
  }
  refresh(parsed.data.length === 1 ? parsed.data[0] : undefined);
  return { data: n };
}

export async function liftSuspension(id: string, reason: string): Promise<AdminResult> {
  const admin = await adminFor("sensitive");
  if (isStepUp(admin)) return admin;
  const target = await targetOf(id, admin);
  if (!target) return { error: "Compte introuvable." };
  const motive = reasonOf(reason);
  await db.update(users).set({ suspendedUntil: null, suspensionReason: null, suspensionMessage: null }).where(eq(users.id, target.id));
  await auditAction(admin, { action: "compte.suspension_levee", target: label(target), reason: motive, before: { suspendedUntil: target.suspendedUntil } });
  await warn(target, "Ta suspension est levée", "Ton compte est de nouveau accessible.");
  refresh(target.id);
  return {};
}

/* ------------------------------------------------------------------ Bannissement, réactivation */

/** Critique : compte fermé, sessions coupées, et l'empreinte HMAC de l'adresse empêche toute nouvelle inscription (3 ans). */
export async function banUser(id: string, reason: string): Promise<AdminResult> {
  const admin = await adminFor("critical");
  if (isStepUp(admin)) return admin;
  const target = await targetOf(id, admin);
  if (!target) return { error: "Compte introuvable." };
  const motive = reasonOf(reason);
  const refusal = await guardAdminChange(target.id, "disable");
  if (refusal) return { error: refusal };
  await db.update(users).set({ status: "banned" }).where(eq(users.id, target.id));
  await db.insert(schema.bannedIdentities).values({ emailHmac: emailHmac(target.email, env.secretKey), reason: motive.slice(0, 300), createdBy: admin.id, expiresAt: new Date(Date.now() + 3 * 365 * 86_400_000) }).onConflictDoNothing();
  await revokeSessions(target.id);
  await auditAction(admin, { action: "compte.banni", target: label(target), reason: motive, before: { status: target.status }, after: { status: "banned" } });
  await queueMail(target.email, accessMails.closed(target.name));
  forgetAllShellCounters();
  refresh(target.id);
  return {};
}

/** Rouvre un compte désactivé, refusé ou banni (l'empreinte est retirée). */
export async function reactivateUser(id: string, reason: string): Promise<AdminResult> {
  const admin = await adminFor("sensitive");
  if (isStepUp(admin)) return admin;
  const target = await targetOf(id, admin);
  if (!target) return { error: "Compte introuvable." };
  const motive = reasonOf(reason);
  await db.update(users).set({ status: "active", deletionScheduledAt: null }).where(eq(users.id, target.id));
  await db.delete(schema.bannedIdentities).where(eq(schema.bannedIdentities.emailHmac, emailHmac(target.email, env.secretKey)));
  await auditAction(admin, { action: "compte.reactive", target: label(target), reason: motive, before: { status: target.status }, after: { status: "active" } });
  await warn(target, "Ton compte est rouvert", `Tu peux de nouveau te connecter : ${env.baseUrl}/login`);
  forgetAllShellCounters();
  refresh(target.id);
  return {};
}

/* ------------------------------------------------------------------ Matières d'un enseignant */

/** Les matières d'un compte enseignant : sans elles, il ne voit aucun cours et ne peut pas écrire. */
export async function setTeacherSubjects(id: string, subjectIds: number[], reason: string): Promise<AdminResult> {
  const admin = await adminFor("sensitive");
  if (isStepUp(admin)) return admin;
  const target = await targetOf(id, admin);
  if (!target) return { error: "Compte introuvable." };
  if (target.role !== "teacher") return { error: "Ce compte n’est pas enseignant." };
  const parsed = z.array(z.number().int().positive()).max(50).safeParse(subjectIds);
  if (!parsed.success) return { error: "Sélection invalide." };
  const wanted = [...new Set(parsed.data)];
  const known = wanted.length ? await db.select({ id: schema.subjects.id }).from(schema.subjects).where(inArray(schema.subjects.id, wanted)) : [];
  if (known.length !== wanted.length) return { error: "Matière introuvable." };
  const before = await db.select({ id: schema.subjectTeachers.subjectId }).from(schema.subjectTeachers).where(eq(schema.subjectTeachers.userId, target.id));
  await db.transaction(async (tx) => {
    await tx.delete(schema.subjectTeachers).where(eq(schema.subjectTeachers.userId, target.id));
    if (wanted.length) await tx.insert(schema.subjectTeachers).values(wanted.map((subjectId) => ({ subjectId, userId: target.id })));
  });
  await auditAction(admin, { action: "role.matieres", target: label(target), reason: reasonOf(reason), before: { subjects: before.map((b) => b.id) }, after: { subjects: wanted } });
  refresh(target.id);
  return {};
}

/* ------------------------------------------------------------------ Suppression programmée (J+30) */

export async function scheduleDeletion(id: string, reason: string, courses: "keep" | "trash"): Promise<AdminResult> {
  const admin = await adminFor("critical");
  if (isStepUp(admin)) return admin;
  const target = await targetOf(id, admin);
  if (!target) return { error: "Compte introuvable." };
  const motive = reasonOf(reason);
  const refusal = await guardAdminChange(target.id, "delete");
  if (refusal) return { error: refusal };
  const at = new Date(Date.now() + 30 * 86_400_000);
  await db.update(users).set({ status: "disabled", deletionScheduledAt: at }).where(eq(users.id, target.id));
  await revokeSessions(target.id);
  if (courses === "trash") {
    const docs = await db.select({ id: schema.documents.id }).from(schema.documents).where(eq(schema.documents.createdBy, target.id));
    for (const doc of docs) await trashDocument(doc.id, admin.id);
  }
  await auditAction(admin, { action: "compte.suppression", target: label(target), reason: motive, before: { status: target.status }, after: { deletionScheduledAt: at, courses } });
  await queueMail(target.email, accessMails.deletion(target.name, courses === "keep"));
  forgetAllShellCounters();
  refresh(target.id);
  return {};
}

export async function cancelDeletion(id: string, reason: string): Promise<AdminResult> {
  const admin = await adminFor("sensitive");
  if (isStepUp(admin)) return admin;
  const target = await targetOf(id, admin);
  if (!target?.deletionScheduledAt) return { error: "Aucune suppression programmée." };
  const motive = reasonOf(reason);
  await db.update(users).set({ status: "active", deletionScheduledAt: null }).where(eq(users.id, target.id));
  await auditAction(admin, { action: "compte.suppression_annulee", target: label(target), reason: motive });
  await warn(target, "La suppression de ton compte est annulée", `Tu peux de nouveau te connecter : ${env.baseUrl}/login`);
  refresh(target.id);
  return {};
}

/* ------------------------------------------------------------------ Sécurité du compte */

export async function resetSecondFactor(id: string, reason: string): Promise<AdminResult> {
  const admin = await adminFor("sensitive");
  if (isStepUp(admin)) return admin;
  const target = await targetOf(id, admin);
  if (!target) return { error: "Compte introuvable." };
  const motive = reasonOf(reason);
  const refusal = await guardAdminChange(target.id, "reset2fa");
  if (refusal) return { error: refusal };
  // Tout second facteur disparaît et toutes les sessions sont coupées : qui a volé l'un ne garde pas l'autre
  await db.update(users).set({ totpEnabled: false, totpSecret: null, totpLastCounter: 0 }).where(eq(users.id, target.id));
  await db.delete(schema.passkeys).where(eq(schema.passkeys.userId, target.id));
  await db.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, target.id));
  await revokeSessions(target.id);
  await db.update(schema.mfaResetRequests).set({ status: "done", closedAt: new Date(), closedBy: admin.id })
    .where(and(eq(schema.mfaResetRequests.userId, target.id), eq(schema.mfaResetRequests.status, "open")));
  await auditAction(admin, { action: "securite.2fa", target: label(target), reason: motive, before: { totp: target.totpEnabled }, after: { totp: false, passkeys: 0, recoveryCodes: 0, sessions: 0 } });
  await warn(target, "Ton second facteur a été réinitialisé", `Un administrateur a retiré ton application d’authentification, tes clés d’accès et tes codes de secours, et tes appareils ont été déconnectés. Reconnecte-toi puis configure-les à nouveau : ${env.baseUrl}/parametres?securite=1`);
  refresh(target.id);
  return {};
}

/** Une session (par le début de son empreinte), ou toutes. */
export async function signOut(id: string, session: string | null, reason: string): Promise<AdminResult> {
  const admin = await adminFor("sensitive");
  if (isStepUp(admin)) return admin;
  const target = await targetOf(id, admin);
  if (!target) return { error: "Compte introuvable." };
  const motive = reasonOf(reason);
  if (session) {
    if (!/^[0-9a-f]{12}$/.test(session)) return { error: "Session inconnue." };
    const rows = await db.select({ hash: schema.sessions.tokenHash }).from(schema.sessions).where(eq(schema.sessions.userId, target.id));
    const hit = rows.find((r) => r.hash.startsWith(session));
    if (hit) await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, hit.hash));
  } else await revokeSessions(target.id);
  await auditAction(admin, { action: "securite.sessions", target: label(target), reason: motive, after: { all: !session } });
  await notify(target.id, { kind: "alert", title: session ? "Un appareil a été déconnecté par l’équipe" : "Tes appareils ont été déconnectés par l’équipe", body: shownReason(motive), href: "/parametres" });
  refresh(target.id);
  return {};
}

/** Lien de connexion (choisir un mot de passe, 24 h). L'admin ne choisit jamais le mot de passe définitif. */
export async function sendAccessLink(id: string, reason: string): Promise<AdminResult> {
  const admin = await adminFor("sensitive");
  if (isStepUp(admin)) return admin;
  const target = await targetOf(id, admin);
  if (!target) return { error: "Compte introuvable." };
  const motive = reasonOf(reason);
  if (target.status !== "active") return { error: "Le compte doit être actif." };
  await db.delete(schema.oneTimeTokens).where(and(eq(schema.oneTimeTokens.userId, target.id), eq(schema.oneTimeTokens.purpose, "reset")));
  const token = randomToken();
  await db.insert(schema.oneTimeTokens).values({ tokenHash: tokenHash(token), userId: target.id, purpose: "reset", expiresAt: new Date(Date.now() + 24 * 3_600_000) });
  await queueMail(target.email, accessMails.loginLink(target.name, token));
  await auditAction(admin, { action: "securite.lien_connexion", target: label(target), reason: motive });
  return { ok: "Lien envoyé" };
}

export async function forcePasswordChange(id: string, reason: string): Promise<AdminResult> {
  const admin = await adminFor("sensitive");
  if (isStepUp(admin)) return admin;
  const target = await targetOf(id, admin);
  if (!target) return { error: "Compte introuvable." };
  const motive = reasonOf(reason);
  await db.update(users).set({ mustChangePassword: true }).where(eq(users.id, target.id));
  await auditAction(admin, { action: "securite.forcer_mdp", target: label(target), reason: motive });
  await warn(target, "Change ton mot de passe", "À ta prochaine connexion, il te sera demandé de choisir un nouveau mot de passe.");
  refresh(target.id);
  return {};
}

/**
 * Mot de passe provisoire tiré par le serveur (comme à la création directe), montré une seule fois à l'admin : il
 * remplace l'ancien, expire dans 72 h, doit être changé à la connexion ; toutes les sessions sont coupées.
 */
export async function setTemporaryPassword(id: string, reason: string, warnTarget = false): Promise<AdminResult<string>> {
  const admin = await adminFor("sensitive");
  if (isStepUp(admin)) return admin;
  const target = await targetOf(id, admin);
  if (!target) return { error: "Compte introuvable." };
  // Un mot de passe connu de l'admin ouvrirait le compte : jamais sur un autre administrateur
  if (target.isOwner || target.role === "admin") return { error: "Impossible sur un compte administrateur : envoie-lui plutôt un lien." };
  if (target.status !== "active") return { error: "Le compte doit être actif." };
  const motive = reasonOf(reason);
  const password = provisionalPassword((max) => randomInt(max));
  await db.update(users).set({ passwordHash: await hashPassword(password), mustChangePassword: true, provisionalExpiresAt: new Date(Date.now() + 72 * 3_600_000) }).where(eq(users.id, target.id));
  await db.delete(schema.oneTimeTokens).where(and(eq(schema.oneTimeTokens.userId, target.id), eq(schema.oneTimeTokens.purpose, "reset")));
  await revokeSessions(target.id);
  await auditAction(admin, { action: "securite.mdp_provisoire", target: label(target), reason: motive, after: { mustChangePassword: true, sessions: 0, prevenu: warnTarget } });
  if (warnTarget) await warn(target, "Ton mot de passe a été réinitialisé", "L’équipe t’a donné un mot de passe provisoire, valable 72 heures. Tu choisiras le tien à la connexion.");
  refresh(target.id);
  return { data: password };
}

/* ------------------------------------------------------------------ Suppression immédiate */

/**
 * Efface le compte tout de suite, comme la suppression programmée à son terme. Critique (second facteur de moins de
 * 2 min, saisie de l'adresse) ; jamais le propriétaire ni le dernier administrateur.
 */
export async function deleteAccountNow(id: string, reason: string): Promise<AdminResult> {
  const admin = await adminFor("critical");
  if (isStepUp(admin)) return admin;
  const target = await targetOf(id, admin);
  if (!target) return { error: "Compte introuvable." };
  if (target.isOwner) return { error: "Le compte du propriétaire ne se supprime pas." };
  const refusal = await guardAdminChange(target.id, "delete");
  if (refusal) return { error: refusal };
  const motive = reasonOf(reason);
  // Journalisé avant l'effacement : la ligne garde le nom, pas le compte
  await auditAction(admin, { action: "compte.supprime", target: label(target), reason: motive, before: { role: target.role, status: target.status }, after: { immediate: true } });
  await revokeSessions(target.id);
  await deleteUserAccount({ id: target.id, avatarKey: target.avatarKey });
  forgetAllShellCounters();
  revalidatePath("/admin/personnes");
  redirect("/admin/personnes");
}

/* ------------------------------------------------------------------ Voir comme */

export async function startViewAs(id: string, reason: string, warnTarget = false): Promise<AdminResult> {
  const admin = await adminFor("critical");
  if (isStepUp(admin)) return admin;
  const target = await targetOf(id, admin);
  if (!target) return { error: "Compte introuvable." };
  const session = await loadSession();
  if (!session) return { error: "Session expirée." };
  const refusal = await startView(admin, session.session.tokenHash, target, reasonOf(reason), warnTarget === true);
  if (refusal) return { error: refusal };
  redirect(HOME);
}

/** Sessions d'une personne, sans le jeton : appareil, IP, dates ; l'empreinte courte sert à en déconnecter une. */
export async function sessionsOf(id: string) {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return [];
  const rows = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, z.uuid().parse(id))).orderBy(desc(schema.sessions.lastSeenAt));
  return rows.map((s) => ({ key: s.tokenHash.slice(0, 12), agent: s.userAgent, ip: s.ip, lastSeenAt: s.lastSeenAt, createdAt: s.createdAt }));
}
