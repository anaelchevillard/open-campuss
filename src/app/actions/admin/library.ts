"use server";

import { and, eq, ilike, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminFor, isStepUp, reasonOf, shownReason, type AdminResult } from "@/lib/admin-ops";
import { auditAction } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import { addCoauthor, removeCoauthor } from "@/lib/document-authors";
import { syncBadges } from "@/lib/gamification";
import { notify } from "@/lib/notify";
import { forgetAllShellCounters } from "@/lib/shell-cache";
import { purgeNow, restoreDocument, trashDocument } from "@/lib/trash";

const { documents, users } = schema;
const docIds = (value: unknown) => z.array(z.uuid()).min(1).max(500).safeParse(value);
const done = () => { forgetAllShellCounters(); revalidatePath("/admin/contenus"); };

/** Publier ou dépublier (courant, « Annuler » rejoue l'inverse). Publier exige une origine déclarée. */
export async function setPublished(list: string[], published: boolean): Promise<AdminResult<string[]>> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const parsed = docIds(list);
  if (!parsed.success) return { error: "Sélection invalide." };
  const rows = await db.select().from(documents).where(and(inArray(documents.id, parsed.data), isNull(documents.deletedAt)));
  const changed: string[] = [];
  for (const doc of rows) {
    if (doc.published === published) continue;
    if (published && doc.rightsBasis === "unknown") continue;
    await db.update(documents).set(published ? { published: true, publishedAt: doc.publishedAt ?? new Date(), reviewRequested: false, updatedAt: new Date() } : { published: false, updatedAt: new Date() }).where(eq(documents.id, doc.id));
    await auditAction(admin, { action: published ? "cours.publie" : "cours.depublie", target: { type: "document", id: doc.id, label: doc.title }, before: { published: doc.published }, after: { published } });
    if (doc.createdBy) await syncBadges(doc.createdBy);
    changed.push(doc.id);
  }
  done();
  return { data: changed, ...(published && changed.length < rows.length ? { ok: `${rows.length - changed.length} sans origine déclarée, laissés en brouillon` } : {}) };
}

/** Changer de matière en masse : la licence suit la matière. « Annuler » rend à chacun son ancienne matière. */
export async function moveToSubject(list: string[], subjectId: number | null, previous?: Record<string, number | null>): Promise<AdminResult<Record<string, number | null>>> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const parsed = docIds(list);
  if (!parsed.success) return { error: "Sélection invalide." };
  const rows = await db.select({ id: documents.id, title: documents.title, subjectId: documents.subjectId }).from(documents).where(inArray(documents.id, parsed.data));
  const before = Object.fromEntries(rows.map((r) => [r.id, r.subjectId]));
  const subjects = await db.select().from(schema.subjects);
  for (const doc of rows) {
    const next = previous ? previous[doc.id] ?? null : subjectId;
    const subject = subjects.find((s) => s.id === next);
    if (next !== null && !subject) continue;
    await db.update(documents).set({ subjectId: next, ...(subject ? { programId: subject.programId } : {}), updatedAt: new Date() }).where(eq(documents.id, doc.id));
    await auditAction(admin, { action: "cours.matiere", target: { type: "document", id: doc.id, label: doc.title }, before: { subjectId: doc.subjectId }, after: { subjectId: next } });
  }
  done();
  return { data: before };
}

export async function trashDocs(list: string[]): Promise<AdminResult<string[]>> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const parsed = docIds(list);
  if (!parsed.success) return { error: "Sélection invalide." };
  const trashed: string[] = [];
  for (const id of parsed.data) {
    const doc = await trashDocument(id, admin.id);
    if (!doc) continue;
    trashed.push(id);
    await auditAction(admin, { action: "cours.corbeille", target: { type: "document", id, label: doc.title } });
  }
  done();
  return { data: trashed };
}

export async function restoreDocs(list: string[]): Promise<AdminResult> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const parsed = docIds(list);
  if (!parsed.success) return { error: "Sélection invalide." };
  for (const id of parsed.data) {
    const doc = await restoreDocument(id);
    if (doc) await auditAction(admin, { action: "cours.restaure", target: { type: "document", id, label: doc.title } });
  }
  done();
  return {};
}

/** Vider la corbeille (critique) : suppression définitive, sans retour. */
export async function emptyTrash(list: string[] | null, reason: string): Promise<AdminResult<number>> {
  const admin = await adminFor("critical");
  if (isStepUp(admin)) return admin;
  const motive = reasonOf(reason);
  const rows = await db.select({ id: documents.id }).from(documents).where(and(isNotNull(documents.deletedAt), list ? inArray(documents.id, z.array(z.uuid()).max(500).parse(list)) : undefined));
  let n = 0;
  for (const row of rows) if (await purgeNow(row.id)) n++;
  await auditAction(admin, { action: list?.length === 1 ? "cours.purge" : "corbeille.videe", target: { type: "site", id: "corbeille", label: `${n} cours` }, reason: motive });
  done();
  return { data: n };
}

/** Personnes proposées comme nouvel auteur : par nom ou adresse, comptes actifs seulement. */
export async function findPeople(q: string): Promise<{ id: string; name: string; email: string }[]> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return [];
  const text = q.trim().slice(0, 80);
  if (text.length < 2) return [];
  const like = `%${text.replace(/[%_\\]/g, "\\$&")}%`;
  return db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(and(eq(users.status, "active"), or(ilike(users.name, like), ilike(users.email, like)))).limit(8);
}

/**
 * Transfert d'auteur (sensible) : le nouvel auteur devient l'auteur courant, et les crédits le suivent ; l'ancien reste
 * co-auteur si on le garde. Les deux personnes sont prévenues.
 */
export async function transferAuthor(list: string[], newAuthorId: string, keepFormer: boolean, reason: string): Promise<AdminResult<number>> {
  const admin = await adminFor("sensitive");
  if (isStepUp(admin)) return admin;
  const parsed = docIds(list);
  if (!parsed.success) return { error: "Sélection invalide." };
  const motive = reasonOf(reason);
  const [author] = await db.select().from(users).where(and(eq(users.id, z.uuid().parse(newAuthorId)), eq(users.status, "active")));
  if (!author) return { error: "Choisis le nouvel auteur." };
  const rows = await db.select().from(documents).where(inArray(documents.id, parsed.data));
  const formers = new Set<string>();
  for (const doc of rows) {
    if (doc.createdBy === author.id) continue;
    await db.update(documents).set({ createdBy: author.id, updatedAt: new Date() }).where(eq(documents.id, doc.id));
    await removeCoauthor(doc.id, author.id);
    if (doc.createdBy && keepFormer) await addCoauthor(doc.id, doc.createdBy);
    if (doc.createdBy) formers.add(doc.createdBy);
    await auditAction(admin, { action: "cours.auteur", target: { type: "document", id: doc.id, label: doc.title }, reason: motive, before: { createdBy: doc.createdBy }, after: { createdBy: author.id, keepFormer } });
    if (doc.createdBy) await notify(doc.createdBy, { kind: "alert", title: `« ${doc.title} » a un nouvel auteur`, body: keepFormer ? "Tu restes co-auteur." : shownReason(motive), href: `/d/${doc.id}` });
    await notify(author.id, { kind: "alert", title: `Tu es maintenant l’auteur de « ${doc.title} »`, body: shownReason(motive), href: `/d/${doc.id}` });
  }
  for (const id of [...formers, author.id]) await syncBadges(id);
  done();
  return { data: rows.length };
}

/** Co-auteurs ajoutés ou retirés par l'administration (sensible, journalisé). Le co-auteur est prévenu de son ajout. */
export async function setCoauthor(documentId: string, userId: string, add: boolean, reason: string): Promise<AdminResult> {
  const admin = await adminFor("sensitive");
  if (isStepUp(admin)) return admin;
  const docId = z.uuid().safeParse(documentId);
  const personId = z.uuid().safeParse(userId);
  if (!docId.success || !personId.success) return { error: "Sélection invalide." };
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId.data));
  if (!doc) return { error: "Document introuvable." };
  const [person] = await db.select().from(users).where(eq(users.id, personId.data));
  if (!person) return { error: "Compte introuvable." };
  if (doc.createdBy === person.id) return { error: "C’est déjà l’auteur principal." };
  if (add && person.status !== "active") return { error: "Ce compte n’est pas actif." };
  const motive = reasonOf(reason);
  if (add) await addCoauthor(doc.id, person.id);
  else await removeCoauthor(doc.id, person.id);
  await auditAction(admin, { action: add ? "cours.coauteur_ajoute" : "cours.coauteur_retire", target: { type: "document", id: doc.id, label: doc.title }, reason: motive, after: { userId: person.id, name: person.name } });
  if (add) await notify(person.id, { kind: "alert", title: `Tu es co-auteur de « ${doc.title} »`, body: shownReason(motive), href: `/d/${doc.id}` });
  await syncBadges(person.id);
  revalidatePath(`/admin/documents/${doc.id}`);
  revalidatePath(`/d/${doc.id}`);
  done();
  return {};
}
