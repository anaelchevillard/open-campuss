"use server";

import { and, avg, count, eq } from "drizzle-orm";
import { z } from "zod";
import { canRead } from "@/lib/access-server";
import { recordAttestation } from "@/lib/attest-server";
import { audit, clientIp, currentUser, requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { syncBadges } from "@/lib/gamification";
import { notifyAdmins, queueMail } from "@/lib/mail";
import { adminMails, reportMails } from "@/lib/mail/catalog";
import { randomToken, rateHit, rateLimited } from "@/lib/security";
import type { FormState } from "@/components/action-form";

const { documents, thanks, revised, reports, docAuthors, documentRatings } = schema;

async function readableDoc(rawId: string) {
  const user = await requireUser();
  const id = z.uuid().parse(rawId);
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc || !(await canRead(user, doc))) throw new Error("accès refusé");
  return { user, doc };
}

export async function toggleThanks(rawId: string): Promise<{ thanked: boolean; count: number } | { error: string }> {
  const { user, doc } = await readableDoc(rawId);
  if (doc.createdBy === user.id) return { error: "On ne peut pas se remercier soi-même." };
  if (!doc.published) return { error: "Ce document n’est pas publié." };
  const key = `thanks:${user.id}`;
  if (await rateLimited(key, 120, 60)) return { error: "Trop de mercis d’un coup. Réessaie plus tard." };
  await rateHit(key);
  const removed = await db.delete(thanks).where(and(eq(thanks.documentId, doc.id), eq(thanks.userId, user.id))).returning();
  if (!removed.length) await db.insert(thanks).values({ documentId: doc.id, userId: user.id }).onConflictDoNothing();
  await syncBadges(user.id);
  if (doc.createdBy) await syncBadges(doc.createdBy);
  const all = await db.select({ u: thanks.userId }).from(thanks).where(eq(thanks.documentId, doc.id));
  return { thanked: !removed.length, count: all.length };
}

export async function toggleRevised(rawId: string): Promise<{ revised: boolean }> {
  const { user, doc } = await readableDoc(rawId);
  const removed = await db.delete(revised).where(and(eq(revised.documentId, doc.id), eq(revised.userId, user.id))).returning();
  if (!removed.length) await db.insert(revised).values({ documentId: doc.id, userId: user.id }).onConflictDoNothing();
  await syncBadges(user.id);
  return { revised: !removed.length };
}

/** Une seule fois par document : la confirmation ne doit pas devenir un réflexe qu'on ne lit plus. */
export async function attestDownload(rawId: string) {
  const { user, doc } = await readableDoc(rawId);
  await recordAttestation(user, "download", doc);
}

/**
 * Retrait provisoire, en attendant une décision humaine : plusieurs comptes distincts, ou l'enseignant de la matière.
 * Les messages sans compte comptent moins, pour qu'un inconnu ne puisse pas faire retirer un cours à lui seul.
 */
async function hideIfReportedEnough(doc: typeof documents.$inferSelect, user: Awaited<ReturnType<typeof currentUser>>) {
  const open = await db.select({ reporter: reports.reporterId, email: reports.email }).from(reports).where(and(eq(reports.documentId, doc.id), eq(reports.kind, "rights"), eq(reports.status, "open")));
  const accounts = new Set(open.map((r) => r.reporter).filter(Boolean)).size;
  const anonymous = new Set(open.filter((r) => !r.reporter).map((r) => r.email)).size;
  const threshold = env.reportHideThreshold;
  let teacher = false;
  if (user?.role === "teacher" && doc.subjectId) {
    const [link] = await db.select().from(schema.subjectTeachers).where(and(eq(schema.subjectTeachers.subjectId, doc.subjectId), eq(schema.subjectTeachers.userId, user.id)));
    teacher = Boolean(link);
  }
  if (!teacher && accounts < threshold && anonymous < threshold * 2) return;
  await db.update(documents).set({ hiddenByReports: true }).where(eq(documents.id, doc.id));
  await notifyAdmins(adminMails.autoHidden(doc.title));
}

/** Ouvert sans compte : un enseignant ou un ayant droit doit pouvoir demander un retrait. */
export async function sendReport(_: FormState, form: FormData): Promise<FormState> {
  const user = await currentUser();
  if (form.get("website")) return { ok: "Message envoyé." };
  const value = (name: string, max: number) => { const v = form.get(name); return typeof v === "string" ? v.trim().slice(0, max) : ""; };
  const key = `report-ip:${await clientIp()}`;
  if (await rateLimited(key, 8, 60)) return { error: "Trop de messages envoyés. Réessaie plus tard." };
  const kind = z.enum(["rights", "error", "privacy", "other"]).safeParse(value("kind", 16));
  if (!kind.success) return { error: "Choisis l’objet de ton message." };
  const message = value("message", 4000);
  if (message.length < 10) return { error: "Décris ta demande en quelques mots." };
  const email = user?.email ?? value("email", 254).toLowerCase();
  if (!user && !z.email().safeParse(email).success) return { error: "Indique une adresse mail pour recevoir une réponse." };
  const name = user?.name ?? value("name", 120);
  const rawDoc = z.uuid().safeParse(value("doc", 40));
  const [doc] = rawDoc.success ? await db.select().from(documents).where(eq(documents.id, rawDoc.data)) : [];
  await rateHit(key);
  const trackingToken = randomToken();
  await db.insert(reports).values({ kind: kind.data, documentId: doc?.id ?? null, reporterId: user?.id ?? null, name, email, message, trackingToken });
  await audit(email, "signalement", kind.data);
  await notifyAdmins(adminMails.newReport());
  // Un ayant droit extérieur reçoit une réponse de ton juridique : le vouvoiement reste pour lui seul
  await queueMail(email, reportMails.received(kind.data === "rights", trackingToken));
  if (doc && kind.data === "rights") await hideIfReportedEnough(doc, user);
  return { ok: "Message envoyé. Un lien de suivi t’a été envoyé par mail." };
}

const uuid = z.uuid();

async function readable(rawId: string) {
  const user = await requireUser();
  const id = uuid.parse(rawId);
  const [doc] = await db.select({ id: documents.id, kind: documents.kind, programId: documents.programId, published: documents.published, createdBy: documents.createdBy, subjectId: documents.subjectId, hiddenByReports: documents.hiddenByReports, reviewRequested: documents.reviewRequested }).from(documents).where(eq(documents.id, id));
  if (!doc || !(await canRead(user, doc))) throw new Error("accès refusé");
  return { user, doc };
}

export type RatingResult = { mine: number; average: number | null; count: number } | { error: string };

export async function rateDocument(rawId: string, rawStars: number): Promise<RatingResult> {
  const { user, doc } = await readable(rawId);
  const stars = z.number().int().min(1).max(5).parse(rawStars);
  if (!doc.published) return { error: "Ce document n’est pas publié." };
  const [coauthor] = await db.select({ id: docAuthors.userId }).from(docAuthors).where(and(eq(docAuthors.documentId, doc.id), eq(docAuthors.userId, user.id)));
  if (doc.createdBy === user.id || coauthor) return { error: "On ne note pas son propre cours." };
  const key = `rating:${user.id}`;
  if (await rateLimited(key, 120, 60)) return { error: "Trop de notes d’un coup. Réessaie plus tard." };
  await rateHit(key);
  await db.insert(documentRatings).values({ documentId: doc.id, userId: user.id, stars }).onConflictDoUpdate({ target: [documentRatings.documentId, documentRatings.userId], set: { stars, updatedAt: new Date() } });
  const [totals] = await db.select({ average: avg(documentRatings.stars), count: count() }).from(documentRatings).where(eq(documentRatings.documentId, doc.id));
  return { mine: stars, average: totals.average === null ? null : Number(totals.average), count: totals.count };
}
