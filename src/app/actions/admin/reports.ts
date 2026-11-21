"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminFor, isStepUp, type AdminResult } from "@/lib/admin-ops";
import { auditAction } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import { syncBadges } from "@/lib/gamification";
import { queueMail } from "@/lib/mail";
import { adminMails, reportMails } from "@/lib/mail/catalog";
import { notify } from "@/lib/notify";
import { forgetAllShellCounters } from "@/lib/shell-cache";

const done = () => { forgetAllShellCounters(); revalidatePath("/admin/moderation"); revalidatePath("/admin"); };

export async function sendTestMail(): Promise<AdminResult> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  await queueMail(admin.email, adminMails.testMail(), { category: "admin" });
  await auditAction(admin, { action: "systeme.mail_test", target: { type: "site", id: "mail", label: admin.email } });
  return { ok: "Mail de test en file" };
}

/** Relance les mails en échec : prochaine tentative tout de suite. */
export async function retryMails(): Promise<AdminResult<number>> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const rows = await db.update(schema.outbox).set({ nextAttemptAt: new Date() }).where(inArray(schema.outbox.id, (await db.select({ id: schema.outbox.id }).from(schema.outbox)).map((r) => r.id))).returning({ id: schema.outbox.id });
  await auditAction(admin, { action: "systeme.relance", target: { type: "site", id: "mail", label: `${rows.length} mails` } });
  revalidatePath("/admin/systeme");
  return { data: rows.length };
}

/* ------------------------------------------------------------------ Signalements de cours */

/** Garder (rejeter le signalement) ou retirer le cours (dépublier) ; « Annuler » rouvre le signalement et republie. */
export async function decideReport(id: string, decision: "accept" | "reject" | "reopen", response = ""): Promise<AdminResult> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const [report] = await db.select().from(schema.reports).where(eq(schema.reports.id, z.uuid().parse(id)));
  if (!report) return { error: "Signalement introuvable." };
  const [doc] = report.documentId ? await db.select().from(schema.documents).where(eq(schema.documents.id, report.documentId)) : [];
  if (decision === "reopen") {
    await db.update(schema.reports).set({ status: "open", closedAt: null, response: null }).where(eq(schema.reports.id, report.id));
    if (doc && report.status === "accepted") await db.update(schema.documents).set({ published: true, hiddenByReports: false }).where(eq(schema.documents.id, doc.id));
    await auditAction(admin, { action: "signalement.rouvert", target: { type: "report", id: report.id, label: doc?.title ?? report.kind } });
    done();
    return {};
  }
  const status = decision === "accept" ? "accepted" : "dismissed";
  await db.update(schema.reports).set({ status, closedAt: new Date(), response: response.trim().slice(0, 4000) || null }).where(eq(schema.reports.id, report.id));
  if (doc && decision === "accept") await db.update(schema.documents).set({ published: false, updatedAt: new Date() }).where(eq(schema.documents.id, doc.id));
  if (doc && decision === "reject" && doc.hiddenByReports) await db.update(schema.documents).set({ hiddenByReports: false }).where(eq(schema.documents.id, doc.id));
  if (report.email) {
    await queueMail(report.email, reportMails.handled(report.kind === "rights", status === "accepted", response.trim() || null, report.trackingToken));
  }
  if (report.reporterId) await syncBadges(report.reporterId);
  await auditAction(admin, { action: "signalement.clos", target: { type: "report", id: report.id, label: doc?.title ?? report.kind }, after: { status, unpublished: decision === "accept" } });
  done();
  return {};
}

/* ------------------------------------------------------------------ Profils signalés */

/** Réinitialise le champ signalé (avec motif montré à la personne) et verrouille l'apparence 7 jours, ou classe sans suite. */
export async function decideProfileReport(id: string, decision: "accept" | "reject", reason = ""): Promise<AdminResult> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const [report] = await db.select().from(schema.profileReports).where(eq(schema.profileReports.id, z.uuid().parse(id)));
  if (!report) return { error: "Signalement introuvable." };
  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, report.targetId));
  if (decision === "accept" && target) {
    const lock = new Date(Date.now() + 7 * 86_400_000);
    if (report.field === "name") await db.update(schema.users).set({ name: `Membre ${target.friendCode.slice(0, 4)}` }).where(eq(schema.users.id, target.id));
    else if (report.field === "bio") await db.update(schema.users).set({ bio: "" }).where(eq(schema.users.id, target.id));
    else if (report.field === "avatar") await db.update(schema.users).set({ avatarKey: null }).where(eq(schema.users.id, target.id));
    const profileReset = report.field === "status" ? { status: null } : report.field === "banner" ? { banner: null } : {};
    await db.insert(schema.userProfiles).values({ userId: target.id, ...profileReset, appearanceLockedUntil: lock }).onConflictDoUpdate({ target: schema.userProfiles.userId, set: { ...profileReset, appearanceLockedUntil: lock, updatedAt: new Date() } });
    await notify(target.id, { kind: "alert", title: "Une partie de ton profil a été réinitialisée", body: reason.trim().slice(0, 300) || "Elle ne respectait pas les règles du site.", href: "/parametres" });
  }
  await db.update(schema.profileReports).set({ status: decision === "accept" ? "accepted" : "dismissed", closedAt: new Date(), closedBy: admin.id }).where(eq(schema.profileReports.id, report.id));
  await auditAction(admin, { action: "profil.signalement", target: { type: "user", id: report.targetId, label: target?.name ?? "" }, reason, after: { field: report.field, decision } });
  done();
  return {};
}

/* ------------------------------------------------------------------ Questions masquées */

export async function decideQuestion(id: string, keepHidden: boolean): Promise<AdminResult> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const [post] = await db.update(schema.qaPosts).set({ hidden: keepHidden }).where(eq(schema.qaPosts.id, z.uuid().parse(id))).returning();
  if (post) await auditAction(admin, { action: "signalement.clos", target: { type: "report", id: post.id, label: post.body.slice(0, 80) }, after: { hidden: keepHidden } });
  done();
  return {};
}

/* ------------------------------------------------------------------ Demandes de cours */

/** Fusion de doublons : les votes s'additionnent dans la demande gardée (sans double vote), l'autre pointe vers elle. */
export async function mergeRequests(keepId: string, dropId: string): Promise<AdminResult> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const [keep, drop] = [z.uuid().parse(keepId), z.uuid().parse(dropId)];
  if (keep === drop) return { error: "Choisis deux demandes différentes." };
  const { courseRequestVotes, courseRequests } = schema;
  const votes = await db.select().from(courseRequestVotes).where(eq(courseRequestVotes.requestId, drop));
  if (votes.length) await db.insert(courseRequestVotes).values(votes.map((v) => ({ requestId: keep, userId: v.userId, at: v.at }))).onConflictDoNothing();
  const [row] = await db.update(courseRequests).set({ mergedInto: keep, answeredAt: new Date() }).where(eq(courseRequests.id, drop)).returning();
  await auditAction(admin, { action: "demande.fusionnee", target: { type: "request", id: keep, label: row?.text ?? "" }, after: { merged: drop, votes: votes.length } });
  done();
  return {};
}

/** Clore « hors sujet » ou « déjà disponible » (avec lien), corriger le texte, réattribuer la matière. */
export async function updateRequest(id: string, patch: { text?: string; subjectId?: number; close?: "offtopic" | "available" | null; link?: string }): Promise<AdminResult> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const { courseRequests } = schema;
  const [before] = await db.select().from(courseRequests).where(eq(courseRequests.id, z.uuid().parse(id)));
  if (!before) return { error: "Demande introuvable." };
  const set: Partial<typeof courseRequests.$inferInsert> = {};
  if (patch.text !== undefined) {
    const text = patch.text.trim().slice(0, 160);
    if (text.length < 3) return { error: "Texte trop court." };
    set.text = text;
  }
  if (patch.subjectId !== undefined) set.subjectId = patch.subjectId;
  if (patch.close !== undefined) set.answeredAt = patch.close ? new Date() : null;
  await db.update(courseRequests).set(set).where(eq(courseRequests.id, before.id));
  if (patch.close && before.authorId) {
    const link = patch.link && /^\/(?![/\\])/.test(patch.link) ? patch.link : "/demandes";
    await notify(before.authorId, { kind: "course_request", title: patch.close === "available" ? "Ce que tu demandais existe déjà" : "Ta demande a été close", body: before.text, href: link });
  }
  await auditAction(admin, { action: patch.close !== undefined ? "demande.close" : "demande.modifiee", target: { type: "request", id: before.id, label: before.text }, before: { text: before.text, subjectId: before.subjectId }, after: { ...set, close: patch.close } });
  done();
  return {};
}

export async function reopenRequests(list: string[]): Promise<AdminResult> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  await db.update(schema.courseRequests).set({ answeredAt: null, mergedInto: null }).where(and(inArray(schema.courseRequests.id, z.array(z.uuid()).max(50).parse(list))));
  done();
  return {};
}

/* ------------------------------------------------------------------ Fiches mémo signalées */

export async function decideCard(documentId: string, cardKey: string, keep: boolean): Promise<AdminResult> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const { memoCardReports } = schema;
  const [row] = await db.update(memoCardReports).set({ status: keep ? "kept" : "removed", updatedAt: new Date() }).where(and(eq(memoCardReports.documentId, z.uuid().parse(documentId)), eq(memoCardReports.cardKey, cardKey.slice(0, 32)))).returning();
  if (row) await auditAction(admin, { action: "signalement.clos", target: { type: "document", id: documentId, label: row.front.slice(0, 80) }, after: { card: cardKey, keep } });
  done();
  return {};
}

export async function reopenCard(documentId: string, cardKey: string): Promise<AdminResult> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  await db.update(schema.memoCardReports).set({ status: "open" }).where(and(eq(schema.memoCardReports.documentId, z.uuid().parse(documentId)), eq(schema.memoCardReports.cardKey, cardKey.slice(0, 32))));
  done();
  return {};
}
