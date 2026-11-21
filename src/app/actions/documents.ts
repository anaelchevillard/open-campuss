"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canModerate } from "@/lib/access";
import { audit, requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import type { Document, User } from "@/lib/db/schema";
import { addReviewEvent, authorsOf, lastReviewerOf, reviewEventsOf } from "@/lib/document-reviews";
import { rebuildDocumentSearch } from "@/lib/file-jobs";
import { notify } from "@/lib/notify";
import { holdDecision, undoDecision } from "@/lib/review-undo";
import { rateHit, rateLimited } from "@/lib/security";
import { forgetAllShellCounters } from "@/lib/shell-cache";
import { documentStats, forgetAuthorStats } from "@/lib/site-stats";
import { purgeNow, restoreDocument, trashDocument } from "@/lib/trash";
import { canWithdrawDirectly, WITHDRAW_REFUSED } from "@/lib/withdrawal-rules";

/** Actions de l'auteur sur Mes documents. Tout ce qui se défait propose « Annuler » plutôt qu'une confirmation. */
const { documents, revisions, users } = schema;
const uuid = z.uuid();

export type DocResult = { ok: true; id?: string } | { error: string };

async function loadDoc(rawId: string) {
  const user = await requireUser();
  const [doc] = await db.select().from(documents).where(eq(documents.id, uuid.parse(rawId)));
  if (!doc) throw new Error("accès refusé");
  return { user, doc };
}

/** Seul l'auteur principal (ou l'administration) peut retirer, jeter ou dupliquer ; un étudiant, seulement tant que ce n'est pas publié. */
async function owned(rawId: string) {
  const { user, doc } = await loadDoc(rawId);
  if (doc.createdBy !== user.id && user.role !== "admin") throw new Error("accès refusé");
  return { user, doc };
}

function refresh(user: Pick<User, "id">, doc: Pick<Document, "id">) {
  forgetAllShellCounters();
  forgetAuthorStats(user.id);
  revalidatePath("/contribuer");
  revalidatePath(`/d/${doc.id}`);
}

export async function trashMine(rawId: string): Promise<DocResult> {
  const { user, doc } = await owned(rawId);
  if (doc.deletedAt) return { ok: true };
  if (!canWithdrawDirectly(user, doc)) return { error: WITHDRAW_REFUSED };
  await trashDocument(doc.id, user.id);
  await audit(user.email, "document_corbeille", doc.title || doc.id);
  refresh(user, doc);
  return { ok: true };
}

/** Restaurer : depuis la corbeille, ou « Annuler » juste après l'avoir jeté. Pendant 30 jours. */
export async function restoreMine(rawId: string): Promise<DocResult> {
  const { user, doc } = await owned(rawId);
  if (!doc.deletedAt) return { ok: true };
  await restoreDocument(doc.id);
  await audit(user.email, "document_restauré", doc.title || doc.id);
  refresh(user, doc);
  return { ok: true };
}

/** Suppression définitive, seulement depuis la corbeille (la page demande une confirmation). */
export async function purgeMine(rawId: string): Promise<DocResult> {
  const { user, doc } = await owned(rawId);
  if (!doc.deletedAt) return { error: "Mets-le d’abord à la corbeille" };
  if (!canWithdrawDirectly(user, doc)) return { error: WITHDRAW_REFUSED };
  await purgeNow(doc.id);
  await audit(user.email, "document_supprimé", doc.title || doc.id);
  refresh(user, doc);
  return { ok: true };
}

/** Une copie en brouillon. Les images restent celles du cours d'origine, qui doit donc rester en ligne. */
export async function duplicateMine(rawId: string): Promise<DocResult> {
  const { user, doc } = await owned(rawId);
  if (doc.kind !== "editor") return { error: "Seul un document écrit sur Campuss se duplique" };
  const key = `draft:${user.id}`;
  if (await rateLimited(key, 15, 1440)) return { error: "Tu as créé beaucoup de brouillons aujourd’hui" };
  const [copy] = await db.insert(documents).values({
    title: `Copie de ${doc.title || "Sans titre"}`.slice(0, 200), description: doc.description, category: doc.category, programId: doc.programId, subjectId: doc.subjectId,
    chapter: doc.chapter, bodyMarkdown: doc.bodyMarkdown ?? "", bodyBlocks: doc.bodyBlocks, bodyText: doc.bodyText, teacherName: doc.teacherName,
    rightsBasis: doc.rightsBasis, academicYear: doc.academicYear, semester: doc.semester, kind: "editor", published: false, createdBy: user.id,
  }).returning({ id: documents.id });
  await rateHit(key);
  await rebuildDocumentSearch(copy.id);
  await audit(user.email, "document_dupliqué", doc.title || doc.id);
  refresh(user, copy);
  return { ok: true, id: copy.id };
}

/** Retirer de la publication : le cours redevient un brouillon. « Annuler » le remet en ligne tel quel, quelques secondes seulement. */
export async function unpublishMine(rawId: string): Promise<DocResult> {
  const { user, doc } = await owned(rawId);
  if (!doc.published) return { ok: true };
  if (!canWithdrawDirectly(user, doc)) return { error: WITHDRAW_REFUSED };
  const before = { published: doc.published, postReviewAt: doc.postReviewAt, updatedAt: doc.updatedAt };
  await db.update(documents).set({ published: false, postReviewAt: null, updatedAt: new Date() }).where(eq(documents.id, doc.id));
  await audit(user.email, "document_retiré_par_auteur", doc.title);
  refresh(user, doc);
  holdDecision(`${user.id}:unpublish:${doc.id}`, {
    revert: async () => {
      await db.update(documents).set(before).where(eq(documents.id, doc.id));
      refresh(user, doc);
    },
  });
  return { ok: true };
}

export async function undoUnpublish(rawId: string): Promise<DocResult> {
  const user = await requireUser();
  return (await undoDecision(`${user.id}:unpublish:${uuid.parse(rawId)}`)) ? { ok: true } : { error: "Trop tard pour annuler, renvoie-le en relecture" };
}

/** Qui peut lire et écrire dans le fil : les auteurs et les relecteurs de la licence. */
async function threadAccess(rawId: string) {
  const { user, doc } = await loadDoc(rawId);
  const authors = await authorsOf(doc.id, doc.createdBy);
  const isAuthor = authors.includes(user.id);
  if (!isAuthor && !canModerate(user, doc)) throw new Error("accès refusé");
  return { user, doc, authors, isAuthor };
}

const serialize = (events: Awaited<ReturnType<typeof reviewEventsOf>>) => events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }));

/** Ce que montre la feuille d'un document : chiffres, fil, corrections proposées. */
export async function documentSheet(rawId: string) {
  const { doc } = await threadAccess(rawId);
  const [stats, events, pending] = await Promise.all([
    documentStats(doc.id, doc.createdBy),
    reviewEventsOf(doc.id),
    db.select({ id: revisions.id, summary: revisions.summary, createdAt: revisions.createdAt, author: users.name }).from(revisions).leftJoin(users, eq(revisions.authorId, users.id))
      .where(and(eq(revisions.documentId, doc.id), eq(revisions.status, "pending"))).orderBy(desc(revisions.createdAt)).limit(10),
  ]);
  return { stats, events: serialize(events), revisions: pending.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) };
}

/** Un message dans le fil : l'autre partie est prévenue (le relecteur si l'auteur répond, les auteurs sinon). */
export async function postReviewComment(rawId: string, rawBody: string): Promise<DocResult & { events?: ReturnType<typeof serialize> }> {
  const { user, doc, authors, isAuthor } = await threadAccess(rawId);
  const body = z.string().trim().min(1).max(2000).safeParse(rawBody);
  if (!body.success) return { error: "Écris un message de 2 000 caractères au plus" };
  const key = `review-comment:${user.id}`;
  if (await rateLimited(key, 30, 60)) return { error: "Beaucoup de messages d’un coup, réessaie dans un moment" };
  await rateHit(key);
  await addReviewEvent({ documentId: doc.id, authorId: user.id, kind: "comment", body: body.data });
  const title = doc.title || "Sans titre";
  if (isAuthor) {
    const reviewer = await lastReviewerOf(doc.id, authors);
    if (reviewer) await notify(reviewer, { kind: "qa_reply", title: `${user.name} t’a répondu`, body: `${title} : ${body.data}`, href: `/d/${doc.id}` });
  } else {
    for (const author of authors) await notify(author, {
      kind: "qa_reply", title: "Un relecteur t’a écrit", body: `${title} : ${body.data}`, href: `/contribuer?doc=${doc.id}`,
      mail: { subject: "un message sur ton cours", transactional: true, text: `À propos de « ${title} » :`, quote: body.data, action: "Répondre" },
    });
  }
  revalidatePath("/contribuer");
  return { ok: true, events: serialize(await reviewEventsOf(doc.id)) };
}
