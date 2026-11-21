"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MANUAL_BADGES } from "@/lib/admin-actions";
import { adminFor, isStepUp, NO_REASON, reasonOf, shownReason, targetOf, type AdminResult } from "@/lib/admin-ops";
import { auditAction } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import { domainVerdict } from "@/lib/domains";
import { env } from "@/lib/env";
import { syncBadges } from "@/lib/gamification";
import { queueMail } from "@/lib/mail";
import { accountMails } from "@/lib/mail/catalog";
import { notify } from "@/lib/notify";
import { creditReferral } from "@/lib/referrals";
import { randomToken, tokenHash } from "@/lib/security";
import { forgetAllShellCounters, forgetShellCounters } from "@/lib/shell-cache";
import { forgetProfileCaches } from "@/lib/profile-data";
import { deleteKey } from "@/lib/s3";
import { getSetting } from "@/lib/site-settings";

const { users, adminNotes, userBadges, userProfiles } = schema;
const refresh = (id?: string) => { revalidatePath("/admin/personnes"); if (id) revalidatePath(`/admin/personnes/${id}`); };
const ids = (value: unknown) => z.array(z.uuid()).min(1).max(500).safeParse(value);

/* ------------------------------------------------------------------ Demandes d'accès (courantes) */

async function decide(adminId: { id: string; email: string }, list: string[], decision: "accept" | "reject") {
  const rows = await db.select().from(users).where(and(inArray(users.id, list), eq(users.status, "pending")));
  for (const target of rows) {
    await db.update(users).set({ status: decision === "accept" ? "active" : "rejected" }).where(eq(users.id, target.id));
    if (decision === "accept") {
      await queueMail(target.email, accountMails.accessAccepted(target.name));
      await creditReferral(target.id).catch((error) => console.error("parrainage non crédité", error));
    } else {
      await queueMail(target.email, accountMails.accessRefused(target.name));
    }
    await auditAction(adminId, { action: decision === "accept" ? "compte.accepte" : "compte.refuse", target: { type: "user", id: target.id, label: target.name }, before: { status: "pending" }, after: { status: decision === "accept" ? "active" : "rejected" } });
  }
  forgetAllShellCounters();
  return rows.length;
}

export async function decideRequests(list: string[], decision: "accept" | "reject"): Promise<AdminResult<number>> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const parsed = ids(list);
  if (!parsed.success) return { error: "Sélection invalide." };
  const n = await decide(admin, parsed.data, decision);
  refresh();
  return { data: n };
}

/** Annuler une décision qui vient d'être prise : la demande revient en attente (aucun mail de plus). */
export async function undoRequests(list: string[]): Promise<AdminResult> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const parsed = ids(list);
  if (!parsed.success) return { error: "Sélection invalide." };
  await db.update(users).set({ status: "pending" }).where(and(inArray(users.id, parsed.data), inArray(users.status, ["active", "rejected"]), sql`${users.lastLoginAt} is null`));
  forgetAllShellCounters();
  refresh();
  return {};
}

export async function acceptVerifiedDomains(): Promise<AdminResult<string[]>> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const approved = await getSetting("registration.autoApproveDomains");
  const pending = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.status, "pending"));
  const verified = pending.filter((u) => domainVerdict(u.email, approved).kind === "verified").map((u) => u.id);
  if (verified.length) await decide(admin, verified, "accept");
  refresh();
  return { data: verified };
}

/* ------------------------------------------------------------------ Profil, modifiable sur place */

const FIELDS = {
  name: { action: "profil.nom", level: "routine", schema: z.string().trim().min(2, "2 caractères au moins.").max(80) },
  pronouns: { action: "profil.pronoms", level: "routine", schema: z.string().trim().max(30) },
  bio: { action: "profil.bio", level: "routine", schema: z.string().trim().max(280) },
  favoriteSubjectId: { action: "profil.matiere", level: "routine", schema: z.number().int().positive().nullable() },
  programId: { action: "profil.licence", level: "sensitive", schema: z.number().int().positive().nullable() },
  level: { action: "profil.annee", level: "sensitive", schema: z.number().int().min(1).max(3).nullable() },
  email: { action: "profil.adresse", level: "sensitive", schema: z.email("Adresse invalide.").max(254) },
} as const;
export type ProfileField = keyof typeof FIELDS;

/**
 * Un champ du profil, enregistré tout de suite. Courant : nom, pronoms, bio, matière préférée. Sensible (motif, second
 * facteur) : licence, année, adresse. L'adresse n'est changée qu'après confirmation par la nouvelle boîte ; l'ancienne est prévenue.
 */
export async function updateProfileField(id: string, field: ProfileField, value: unknown, reason?: string, warnTarget = false): Promise<AdminResult> {
  const spec = FIELDS[field];
  if (!spec) return { error: "Champ inconnu." };
  const admin = await adminFor(spec.level);
  if (isStepUp(admin)) return admin;
  const target = await targetOf(id, admin, spec.level === "routine");
  if (!target) return { error: "Compte introuvable." };
  if (target.isOwner && admin.id !== target.id && spec.level !== "routine") return { error: "Le compte du propriétaire ne se modifie pas ici." };
  const motive = reasonOf(reason);
  const parsed = spec.schema.safeParse(field === "email" && typeof value === "string" ? value.trim().toLowerCase() : value);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const next = field === "email" ? String(parsed.data).trim().toLowerCase() : parsed.data;
  const before = target[field];
  if (before === next) return {};
  if (field === "programId" && next !== null && !(await db.select({ id: schema.programs.id }).from(schema.programs).where(eq(schema.programs.id, next as number))).length) return { error: "Licence introuvable." };

  if (field === "email") {
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, next as string));
    if (taken) return { error: "Cette adresse a déjà un compte." };
    await db.update(users).set({ pendingEmail: next as string }).where(eq(users.id, target.id));
    await db.delete(schema.oneTimeTokens).where(and(eq(schema.oneTimeTokens.userId, target.id), eq(schema.oneTimeTokens.purpose, "email")));
    const token = randomToken();
    await db.insert(schema.oneTimeTokens).values({ tokenHash: tokenHash(token), userId: target.id, purpose: "email", expiresAt: new Date(Date.now() + 72 * 3_600_000) });
    await queueMail(next as string, accountMails.confirmNewEmail(token, 72, true));
    await queueMail(target.email, accountMails.emailChangeByTeam(next as string));
    await auditAction(admin, { action: "profil.adresse", target: { type: "user", id: target.id, label: target.name }, reason: motive, before: { email: target.email }, after: { pendingEmail: next } });
    refresh(target.id);
    return { ok: "Lien de confirmation envoyé à la nouvelle adresse" };
  }

  await db.update(users).set({ [field]: next }).where(eq(users.id, target.id));
  await auditAction(admin, { action: spec.action, target: { type: "user", id: target.id, label: target.name }, reason: spec.level === "routine" && !reason?.trim() ? null : motive, before: { [field]: before }, after: { [field]: next, prevenu: warnTarget } });
  // Aucune notification par défaut : seulement si l'admin coche « Prévenir l'utilisateur »
  if (warnTarget && admin.id !== target.id) {
    const shown = spec.level === "sensitive" && motive !== NO_REASON ? motive : "";
    await notify(target.id, { kind: "alert", title: "Ton profil a été modifié par l’équipe", body: shown, href: "/parametres", ...(spec.level === "sensitive" ? { mail: { subject: "ton profil a été modifié", text: `L’équipe a modifié ton profil (${field === "programId" ? "licence" : "année"}).${shown ? ` Motif : ${shown}` : ""}`, transactional: true } } : {}) });
  }
  forgetShellCounters(target.id);
  refresh(target.id);
  return {};
}

/**
 * Réinitialisations du profil (courantes, journalisées). L'avatar et l'image de bannière retirés sont aussi effacés du
 * stockage (contenu illicite) ; l'apparence se verrouille 7 jours. La personne n'est prévenue que si l'admin le demande.
 */
export async function resetProfilePart(id: string, part: "avatar" | "friendCode" | "font" | "badge" | "banner" | "status" | "appearance", reason?: string, warnTarget = false): Promise<AdminResult> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const target = await targetOf(id, admin);
  if (!target) return { error: "Compte introuvable." };
  const motive = reasonOf(reason);
  const label = { type: "user" as const, id: target.id, label: target.name };
  if (part === "avatar") {
    await db.update(users).set({ avatarKey: null }).where(eq(users.id, target.id));
    if (target.avatarKey) await deleteKey(target.avatarKey).catch(() => undefined);
    await auditAction(admin, { action: "profil.avatar", target: label, reason: motive, before: { avatar: Boolean(target.avatarKey) }, after: { avatar: false, prevenu: warnTarget } });
  } else if (part === "friendCode") {
    await db.update(users).set({ friendCode: sql`upper(substr(md5(gen_random_uuid()::text), 1, 10))` }).where(eq(users.id, target.id));
    await auditAction(admin, { action: "profil.code_ami", target: label, reason: motive, after: { prevenu: warnTarget } });
  } else {
    const lock = new Date(Date.now() + 7 * 86_400_000);
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, target.id));
    const reset = part === "font" ? { nameStyle: null } : part === "badge" ? { badgeShown: null } : part === "banner" ? { banner: null } : part === "status" ? { status: null }
      : { nameStyle: null, badgeShown: null, banner: null, status: null, avatarFrame: null, avatarEffect: null, profileColors: null };
    await db.insert(userProfiles).values({ userId: target.id, ...reset, appearanceLockedUntil: lock }).onConflictDoUpdate({ target: userProfiles.userId, set: { ...reset, appearanceLockedUntil: lock, updatedAt: new Date() } });
    // L'image de bannière quitte aussi le stockage
    if ("banner" in reset && profile?.banner?.kind === "image" && profile.banner.key) await deleteKey(profile.banner.key).catch(() => undefined);
    await auditAction(admin, { action: part === "banner" ? "profil.banniere" : "profil.apparence", target: label, reason: motive, before: profile ? { part, nameStyle: profile.nameStyle, badgeShown: profile.badgeShown, banner: profile.banner, status: profile.status } : null, after: { part, lockedUntil: lock, prevenu: warnTarget } });
  }
  if (warnTarget) await notify(target.id, { kind: "alert", title: part === "friendCode" ? "Ton code ami a changé" : "Une partie de ton profil a été réinitialisée", body: shownReason(motive), href: "/parametres" });
  forgetProfileCaches(target.id);
  revalidatePath(`/u/${target.id}`);
  refresh(target.id);
  return {};
}

/* ------------------------------------------------------------------ Crédits, badges, objets */

export async function adjustCredits(id: string, delta: number, reason: string): Promise<AdminResult> {
  const admin = await adminFor("sensitive");
  if (isStepUp(admin)) return admin;
  const target = await targetOf(id, admin);
  if (!target) return { error: "Compte introuvable." };
  const motive = reasonOf(reason);
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1000) return { error: "Entre −1000 et 1000, sans zéro." };
  await db.insert(schema.creditAdjustments).values({ userId: target.id, delta, reason: motive.slice(0, 300), createdBy: admin.id });
  await auditAction(admin, { action: "credits.ajustes", target: { type: "user", id: target.id, label: target.name }, reason: motive, after: { delta } });
  await notify(target.id, { kind: "alert", title: `${delta > 0 ? "+" : "−"}${Math.abs(delta)} crédits ajustés par l’équipe`, body: shownReason(motive), href: "/moi", mail: { subject: "tes crédits ont été ajustés", text: `L’équipe a ajusté tes crédits de ${delta > 0 ? "+" : ""}${delta}.${motive === NO_REASON ? "" : ` Motif : ${motive}`}`, transactional: true } });
  forgetShellCounters(target.id);
  refresh(target.id);
  return {};
}

export async function setBadge(id: string, badge: string, grant: boolean, reason?: string): Promise<AdminResult> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const target = await targetOf(id, admin, true);
  if (!target) return { error: "Compte introuvable." };
  if (!/^[a-z0-9-]{2,32}$/.test(badge)) return { error: "Badge inconnu." };
  const label = { type: "user" as const, id: target.id, label: target.name };
  if (grant) {
    if (!MANUAL_BADGES.some((b) => b.id === badge)) {
      // Un badge calculé retiré peut être rendu
      await db.update(userBadges).set({ revokedAt: null, revokedReason: null }).where(and(eq(userBadges.userId, target.id), eq(userBadges.badge, badge)));
    } else {
      await db.insert(userBadges).values({ userId: target.id, badge, grantedBy: admin.id }).onConflictDoUpdate({ target: [userBadges.userId, userBadges.badge], set: { revokedAt: null, revokedReason: null, grantedBy: admin.id } });
      await notify(target.id, { kind: "alert", title: `Badge « ${MANUAL_BADGES.find((b) => b.id === badge)!.name} » reçu`, href: `/u/${target.id}` });
    }
    await auditAction(admin, { action: "badge.attribue", target: label, after: { badge } });
  } else {
    await db.update(userBadges).set({ revokedAt: new Date(), revokedReason: reason?.trim().slice(0, 300) || null }).where(and(eq(userBadges.userId, target.id), eq(userBadges.badge, badge)));
    await auditAction(admin, { action: "badge.retire", target: label, reason, before: { badge } });
  }
  await syncBadges(target.id);
  refresh(target.id);
  return {};
}

export async function grantUnlock(id: string, item: string, revoke = false): Promise<AdminResult> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const target = await targetOf(id, admin, true);
  if (!target) return { error: "Compte introuvable." };
  if (!/^[a-z0-9:_-]{2,32}$/.test(item)) return { error: "Objet inconnu." };
  if (revoke) await db.delete(schema.userUnlocks).where(and(eq(schema.userUnlocks.userId, target.id), eq(schema.userUnlocks.item, item)));
  else await db.insert(schema.userUnlocks).values({ userId: target.id, item, source: "admin", grantedBy: admin.id }).onConflictDoNothing();
  await auditAction(admin, { action: "objet.accorde", target: { type: "user", id: target.id, label: target.name }, after: { item, revoke } });
  refresh(target.id);
  return {};
}

/* ------------------------------------------------------------------ Notes internes */

export async function addNote(id: string, body: string): Promise<AdminResult> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const target = await targetOf(id, admin, true);
  if (!target) return { error: "Compte introuvable." };
  const text = body.trim().slice(0, 2000);
  if (!text) return { error: "Écris la note." };
  const [note] = await db.insert(adminNotes).values({ userId: target.id, authorId: admin.id, body: text }).returning({ id: adminNotes.id });
  await auditAction(admin, { action: "note.ajoutee", target: { type: "user", id: target.id, label: target.name } });
  refresh(target.id);
  return { ok: note.id };
}

export async function pinNote(noteId: string, pinned: boolean): Promise<AdminResult> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const [note] = await db.update(adminNotes).set({ pinned, updatedAt: new Date() }).where(eq(adminNotes.id, z.uuid().parse(noteId))).returning();
  if (note) refresh(note.userId);
  return {};
}

/** Une note supprimée revient par « Annuler » (le texte est rendu à l'appelant). */
export async function deleteNote(noteId: string): Promise<AdminResult<{ body: string; pinned: boolean; userId: string }>> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const [note] = await db.delete(adminNotes).where(eq(adminNotes.id, z.uuid().parse(noteId))).returning();
  if (!note) return {};
  await auditAction(admin, { action: "note.supprimee", target: { type: "user", id: note.userId, label: "" }, before: { body: note.body } });
  refresh(note.userId);
  return { data: { body: note.body, pinned: note.pinned, userId: note.userId } };
}

/* ------------------------------------------------------------------ Actions groupées */

export async function bulkMessage(list: string[], title: string, body: string): Promise<AdminResult<number>> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const parsed = ids(list);
  if (!parsed.success) return { error: "Sélection invalide." };
  const head = title.trim().slice(0, 120);
  if (head.length < 3) return { error: "Écris le message." };
  const rows = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, parsed.data), eq(users.status, "active")));
  for (const row of rows) await notify(row.id, { kind: "alert", title: head, body: body.trim().slice(0, 500), href: "/notifications" });
  await auditAction(admin, { action: "personnes.message", target: { type: "site", id: "personnes", label: `${rows.length} personnes` }, after: { title: head } });
  return { data: rows.length };
}

export async function bulkProgram(list: string[], programId: number | null, level: number | null, reason: string, warnTarget = false): Promise<AdminResult<number>> {
  const admin = await adminFor("sensitive");
  if (isStepUp(admin)) return admin;
  const parsed = ids(list);
  if (!parsed.success) return { error: "Sélection invalide." };
  const motive = reasonOf(reason);
  if (programId === null && level === null) return { error: "Choisis une licence ou une année." };
  const set = { ...(programId !== null ? { programId } : {}), ...(level !== null ? { level } : {}) };
  const rows = await db.update(users).set(set).where(and(inArray(users.id, parsed.data), eq(users.isOwner, false))).returning({ id: users.id, name: users.name });
  for (const row of rows) {
    await auditAction(admin, { action: programId !== null ? "profil.licence" : "profil.annee", target: { type: "user", id: row.id, label: row.name }, reason: motive, after: { ...set, prevenu: warnTarget } });
    if (warnTarget) await notify(row.id, { kind: "alert", title: "Ta licence ou ton année a été modifiée par l’équipe", body: shownReason(motive), href: "/parametres" });
  }
  forgetAllShellCounters();
  refresh();
  return { data: rows.length };
}

/** Export CSV de la sélection (sensible, journalisé) : identité, licence, état ; jamais de secret. */
export async function exportPeople(list: string[], reason: string): Promise<AdminResult<string>> {
  const admin = await adminFor("sensitive");
  if (isStepUp(admin)) return admin;
  const parsed = ids(list);
  if (!parsed.success) return { error: "Sélection invalide." };
  const motive = reasonOf(reason);
  const rows = await db.select({ name: users.name, email: users.email, status: users.status, role: users.role, program: schema.programs.name, level: users.level, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt })
    .from(users).leftJoin(schema.programs, eq(users.programId, schema.programs.id)).where(inArray(users.id, parsed.data));
  const cell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""').replace(/^[=+\-@]/, "'$&")}"`;
  const csv = ["nom;adresse;etat;role;licence;annee;inscription;derniere_connexion", ...rows.map((r) => [r.name, r.email, r.status, r.role, r.program, r.level ? `L${r.level}` : "", r.createdAt.toISOString(), r.lastLoginAt?.toISOString() ?? ""].map(cell).join(";"))].join("\n");
  await auditAction(admin, { action: "personnes.export", target: { type: "site", id: "personnes", label: `${rows.length} personnes` }, reason: motive });
  return { data: csv };
}

/** « Tester un lien » : ce compte pourrait-il ouvrir ce cours ? (rien n'est ouvert à sa place) */
export async function testLink(id: string, url: string): Promise<AdminResult<string>> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const target = await targetOf(id, admin, true);
  if (!target) return { error: "Compte introuvable." };
  const docId = /\/d\/([0-9a-f-]{36})/i.exec(url)?.[1];
  if (!docId) return { data: /^\/(admin|moderation)/.test(new URL(url, env.baseUrl).pathname) ? (target.role === "admin" ? "Oui" : "Non : réservé à l’équipe") : "Seuls les liens de cours (/d/…) se testent ici" };
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, docId));
  if (!doc) return { data: "Ce cours n’existe pas" };
  const { canRead } = await import("@/lib/access-server");
  const ok = target.status === "active" && await canRead(target, doc);
  return { data: ok ? `Oui : « ${doc.title} » lui est ouvert` : doc.deletedAt ? "Non : le cours est à la corbeille" : !doc.published ? "Non : le cours n’est pas publié" : target.programId !== doc.programId ? "Non : autre licence" : target.status !== "active" ? "Non : compte inactif" : "Non" };
}
