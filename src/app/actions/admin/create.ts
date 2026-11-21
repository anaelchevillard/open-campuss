"use server";

import { and, eq, isNull } from "drizzle-orm";
import { randomInt, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminFor, isStepUp, reasonOf, type AdminResult } from "@/lib/admin-ops";
import { auditAction } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import { demoFormRefusal } from "@/lib/demo";
import { env } from "@/lib/env";
import { parseInviteList, queuePlan, sendable, type InviteRow } from "@/lib/invitation-rules";
import { INVITE_DAYS, inviteUrl, invitationsSentToday, isBanned, placeholderHash, registeredEmails, sendInvitation } from "@/lib/invitations";
import { queueMail } from "@/lib/mail";
import { accountMails } from "@/lib/mail/catalog";
import { hashPassword, randomToken, tokenHash } from "@/lib/security";
import { getSetting } from "@/lib/site-settings";
import { provisionalPassword } from "@/lib/suspension";

const { users, invitations } = schema;

const accountInput = z.object({
  name: z.string().trim().min(2, "Indique le nom.").max(80),
  email: z.email("Adresse invalide.").max(254),
  programId: z.number().int().positive().nullable(),
  level: z.number().int().min(1).max(3).nullable(),
  role: z.enum(["member", "delegate"]),
  mode: z.enum(["link", "password"]),
  reason: z.string(),
});
export type AccountInput = z.input<typeof accountInput>;

/**
 * Création directe, active sans validation. Par lien d'activation (7 jours, montré une fois et envoyé) ou par mot de passe
 * provisoire (4 mots, montré une fois, à changer, expire après 72 h). La personne accepte elle-même les CGU.
 */
export async function createAccount(raw: AccountInput): Promise<AdminResult<{ id: string; link?: string; password?: string }>> {
  const demo = demoFormRefusal();
  if (demo) return demo;
  const admin = await adminFor("sensitive");
  if (isStepUp(admin)) return admin;
  const parsed = accountInput.safeParse({ ...raw, email: String(raw.email ?? "").trim().toLowerCase() });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const motive = reasonOf(v.reason);
  if (await isBanned(v.email)) return { error: "Cette adresse est bannie." };
  const password = v.mode === "password" ? provisionalPassword((max) => randomInt(max)) : null;
  const [user] = await db.insert(users).values({
    email: v.email, name: v.name, programId: v.programId, level: v.level, role: v.role, status: "active",
    passwordHash: await hashPassword(password ?? randomToken()), mustChangePassword: true,
    provisionalExpiresAt: password ? new Date(Date.now() + 72 * 3_600_000) : null, invitedBy: admin.id,
  }).onConflictDoNothing().returning();
  if (!user) return { error: "Cette adresse a déjà un compte." };
  let link: string | undefined;
  if (!password) {
    const token = randomToken();
    await db.insert(schema.oneTimeTokens).values({ tokenHash: tokenHash(token), userId: user.id, purpose: "reset", expiresAt: new Date(Date.now() + 7 * 86_400_000) });
    link = `${env.baseUrl}/reset/${token}`;
    await queueMail(v.email, accountMails.accountReady(v.name, token));
  }
  await auditAction(admin, { action: "compte.cree", target: { type: "user", id: user.id, label: v.name }, reason: motive, after: { email: v.email, role: v.role, programId: v.programId, level: v.level, mode: v.mode } });
  revalidatePath("/admin/personnes");
  return { data: { id: user.id, link, password: password ?? undefined } };
}

/* ------------------------------------------------------------------ Invitations nominatives */

/** Aperçu avant envoi : rien n'est écrit. */
export async function previewInvites(text: string): Promise<AdminResult<{ rows: InviteRow[]; today: number; later: number }>> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const draft = parseInviteList(text, new Set());
  const known = await registeredEmails(draft.map((r) => r.email).filter(Boolean));
  const rows = parseInviteList(text, known);
  const plan = queuePlan(sendable(rows).length, await invitationsSentToday(), await getSetting("mail.dailyLimit"));
  return { data: { rows, today: plan.today, later: plan.later } };
}

const bulkInput = z.object({
  text: z.string().max(100_000),
  programId: z.number().int().positive().nullable(),
  level: z.number().int().min(1).max(3).nullable(),
  role: z.enum(["member", "delegate"]),
  message: z.string().max(500),
  reason: z.string(),
});

/** Met les invitations en file : la boucle de fond les envoie sous le plafond quotidien de mails. */
export async function queueInvites(raw: z.input<typeof bulkInput>): Promise<AdminResult<{ queued: number; today: number; later: number }>> {
  const demo = demoFormRefusal();
  if (demo) return demo;
  const admin = await adminFor("sensitive");
  if (isStepUp(admin)) return admin;
  const parsed = bulkInput.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const motive = reasonOf(v.reason);
  const draft = parseInviteList(v.text, new Set());
  const rows = sendable(parseInviteList(v.text, await registeredEmails(draft.map((r) => r.email))));
  if (!rows.length) return { error: "Aucune adresse à inviter." };
  const programs = await db.select().from(schema.programs);
  const programOf = (label: string) => programs.find((p) => p.name.toLowerCase() === label.toLowerCase() || p.slug === label.toLowerCase())?.id ?? null;
  const batchId = randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  await db.insert(invitations).values(rows.map((r) => ({
    tokenHash: placeholderHash(), email: r.email, name: r.name, role: v.role, programId: (r.program && programOf(r.program)) || v.programId, level: r.level ?? v.level,
    message: v.message.trim(), batchId, createdBy: admin.id, expiresAt,
  })));
  const plan = queuePlan(rows.length, await invitationsSentToday(), await getSetting("mail.dailyLimit"));
  await auditAction(admin, { action: "invitations.envoyees", target: { type: "invitation", id: batchId, label: `${rows.length} invitations` }, reason: motive, after: { count: rows.length, programId: v.programId, level: v.level, role: v.role } });
  revalidatePath("/admin/invitations");
  return { data: { queued: rows.length, today: plan.today, later: plan.later } };
}

/* ------------------------------------------------------------------ Lien ouvert */

const linkInput = z.object({
  programId: z.number().int().positive().nullable(),
  level: z.number().int().min(1).max(3).nullable(),
  maxUses: z.number().int().min(1).max(2000),
  days: z.number().int().min(1).max(90),
  allowedDomain: z.string().trim().toLowerCase().regex(/^$|^[a-z0-9.-]+\.[a-z]{2,}$/, "Domaine invalide."),
  reason: z.string(),
});

/** Lien ouvert (QR) : le jeton n'est montré qu'ici ; la licence et le domaine sont imposés à l'inscription. */
export async function createOpenLink(raw: z.input<typeof linkInput>): Promise<AdminResult<{ id: string; url: string }>> {
  const demo = demoFormRefusal();
  if (demo) return demo;
  const admin = await adminFor("sensitive");
  if (isStepUp(admin)) return admin;
  const parsed = linkInput.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const motive = reasonOf(v.reason);
  const token = randomToken();
  const [row] = await db.insert(invitations).values({
    tokenHash: tokenHash(token), email: null, role: "member", programId: v.programId, level: v.level, maxUses: v.maxUses, allowedDomain: v.allowedDomain || null,
    createdBy: admin.id, expiresAt: new Date(Date.now() + v.days * 86_400_000), sentAt: new Date(),
  }).returning({ id: invitations.id });
  await auditAction(admin, { action: "invitation.lien", target: { type: "invitation", id: row.id, label: "Lien ouvert" }, reason: motive, after: { programId: v.programId, level: v.level, maxUses: v.maxUses, days: v.days, domain: v.allowedDomain } });
  revalidatePath("/admin/invitations");
  return { data: { id: row.id, url: inviteUrl(token) } };
}

export async function revokeInvitation(id: string, undo = false): Promise<AdminResult> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const [row] = await db.update(invitations).set({ revokedAt: undo ? null : new Date() }).where(eq(invitations.id, z.uuid().parse(id))).returning();
  if (row) await auditAction(admin, { action: "invitation.revoquee", target: { type: "invitation", id: row.id, label: row.email ?? "Lien ouvert" }, after: { undo } });
  revalidatePath("/admin/invitations");
  return {};
}

/** Renvoi : nouveau jeton, nouvelle échéance, l'ancien lien ne marche plus. */
export async function resendInvitation(id: string): Promise<AdminResult> {
  const demo = demoFormRefusal();
  if (demo) return demo;
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const [inv] = await db.select().from(invitations).where(and(eq(invitations.id, z.uuid().parse(id)), isNull(invitations.acceptedAt)));
  if (!inv?.email) return { error: "Invitation introuvable." };
  await db.update(invitations).set({ revokedAt: null }).where(eq(invitations.id, inv.id));
  await sendInvitation(inv);
  await auditAction(admin, { action: "invitation.renvoyee", target: { type: "invitation", id: inv.id, label: inv.email } });
  revalidatePath("/admin/invitations");
  return { ok: "Invitation renvoyée" };
}

/** Espace enseignant : compte actif rattaché à des matières, lien de 7 jours pour choisir son mot de passe. */
export async function createTeacher(raw: { name: string; email: string; subjectIds: number[]; reason: string }): Promise<AdminResult> {
  const demo = demoFormRefusal();
  if (demo) return demo;
  const admin = await adminFor("sensitive");
  if (isStepUp(admin)) return admin;
  const email = String(raw.email ?? "").trim().toLowerCase().slice(0, 254);
  const name = String(raw.name ?? "").trim().slice(0, 80);
  if (!z.email().safeParse(email).success || name.length < 2) return { error: "Indique un nom et une adresse valides." };
  const motive = reasonOf(raw.reason);
  const subjectIds = (raw.subjectIds ?? []).filter((n) => Number.isInteger(n) && n > 0).slice(0, 50);
  if (!subjectIds.length) return { error: "Choisis au moins une matière." };
  const [user] = await db.insert(users).values({ email, name, role: "teacher", status: "active", passwordHash: await hashPassword(randomToken()), invitedBy: admin.id }).onConflictDoNothing().returning();
  if (!user) return { error: "Cette adresse a déjà un compte." };
  await db.insert(schema.subjectTeachers).values(subjectIds.map((subjectId) => ({ subjectId, userId: user.id }))).onConflictDoNothing();
  const token = randomToken();
  await db.insert(schema.oneTimeTokens).values({ tokenHash: tokenHash(token), userId: user.id, purpose: "reset", expiresAt: new Date(Date.now() + 7 * 86_400_000) });
  await queueMail(email, accountMails.teacherSpace(token));
  await auditAction(admin, { action: "compte.cree", target: { type: "user", id: user.id, label: name }, reason: motive, after: { role: "teacher", subjects: subjectIds } });
  revalidatePath("/admin/personnes");
  return { ok: `${name} a reçu son lien` };
}
