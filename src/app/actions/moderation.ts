"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { afterPublished } from "@/lib/after-publish";
import { canModerate } from "@/lib/access";
import { canRead } from "@/lib/access-server";
import { audit, clientIp, requireAdmin, requireModerator, requireUser } from "@/lib/auth";
import { courseText } from "@/lib/course";
import { rebuildDocumentSearch } from "@/lib/file-jobs";
import { db, schema } from "@/lib/db";
import { recordAttestation } from "@/lib/attest-server";
import { TERMS_VERSION } from "@/lib/db/categories";
import type { Document, User } from "@/lib/db/schema";
import { addCorrector, removeCoauthor } from "@/lib/document-authors";
import { addReviewEvent, authorsOf, removeReviewEvent } from "@/lib/document-reviews";
import { syncBadges } from "@/lib/gamification";
import { forgetAllShellCounters } from "@/lib/shell-cache";
import { notifyAdmins, queueMail } from "@/lib/mail";
import { adminMails, contentMails } from "@/lib/mail/catalog";
import type { MailContent } from "@/lib/mail/content";
import { cardKey } from "@/lib/memo-cards";
import { notify } from "@/lib/notify";
import { reviewNoteOf } from "@/lib/review-reasons";
import { holdDecision, undoDecision } from "@/lib/review-undo";
import { forgetAuthorStats } from "@/lib/site-stats";
import { markDocumentReviewed } from "@/lib/trusted";

const { users, documents, docFiles, revisions, memoDecks, memoCardReports } = schema;

const uuid = z.uuid();

const idOf = (form: FormData, name = "id") => {
  const parsed = uuid.safeParse(form.get(name));
  if (!parsed.success) throw new Error("identifiant invalide");
  return parsed.data;
};

const str = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

export type QueueResult = { ok: true } | { error: string };

const reasonSchema = z.number().int().min(1).max(7).optional();
const wordSchema = z.string().max(500).optional();

export async function unpublishDocument(form: FormData) {
  const admin = await requireAdmin();
  const id = idOf(form);
  const [doc] = await db.update(documents).set({ published: false, updatedAt: new Date() }).where(eq(documents.id, id)).returning();
  if (doc) {
    await audit(admin.email, "document_dépublié", doc.title);
    await addReviewEvent({ documentId: id, authorId: admin.id, kind: "removed", body: "Retiré de la publication par l’administration" });
  }
  revalidatePath(`/d/${id}`);
  revalidatePath("/admin/moderation");
}

async function moderated(id: string) {
  const user = await requireModerator();
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc || doc.deletedAt || !canModerate(user, doc)) throw new Error("accès refusé");
  return { user, doc };
}

async function mailAuthors(documentId: string, createdBy: string | null, mail: MailContent) {
  for (const id of await authorsOf(documentId, createdBy)) {
    const [author] = await db.select().from(users).where(eq(users.id, id));
    if (author) await queueMail(author.email, mail, { batch: true });
  }
}

function refresh(id: string, authors: string[]) {
  forgetAllShellCounters();
  for (const author of authors) forgetAuthorStats(author);
  revalidatePath(`/d/${id}`);
  revalidatePath("/moderation");
  revalidatePath("/contribuer");
}

/* Renvoyer et publier : le cœur commun au formulaire, à la file et à la barre de relecture */

async function sendBack(user: User, doc: Document, reason: number | undefined, word: string, { defer }: { defer: boolean }): Promise<QueueResult> {
  const note = reviewNoteOf(reason, word) || word.trim().slice(0, 1000);
  if (note.length < 3) return { error: "Choisis un motif" };
  const before = { reviewRequested: doc.reviewRequested, reviewNote: doc.reviewNote, reviewedBy: doc.reviewedBy, reviewedAt: doc.reviewedAt };
  await db.update(documents).set({ reviewRequested: false, reviewNote: note, published: false, reviewedBy: null, reviewedAt: null }).where(eq(documents.id, doc.id));
  const event = await addReviewEvent({ documentId: doc.id, authorId: user.id, kind: "rejected", reasonCode: reason ?? null, body: word.trim() });
  const authors = await authorsOf(doc.id, doc.createdBy);
  const release = async () => {
    for (const author of authors) await notify(author, {
      kind: "rejected", title: "Ton cours a besoin d’une correction", body: `${doc.title} : ${note}`, href: `/editer/${doc.id}`,
      mail: { subject: "ton cours a besoin d’une correction", transactional: true, text: `« ${doc.title} » n’a pas été publié.\n\nMotif : ${note}\n\nTu peux le corriger et le renvoyer.`, action: "Corriger le cours" },
    });
  };
  await audit(user.email, "document_refusé", doc.title);
  refresh(doc.id, authors);
  if (!defer) { await release(); return { ok: true }; }
  holdDecision(`${user.id}:${doc.id}`, {
    release,
    revert: async () => {
      await db.update(documents).set(before).where(eq(documents.id, doc.id));
      await removeReviewEvent(event.id);
      await audit(user.email, "refus_annulé", doc.title);
      refresh(doc.id, authors);
    },
  });
  return { ok: true };
}

async function publish(user: User, current: Document, { defer }: { defer: boolean }): Promise<QueueResult> {
  if (current.rightsBasis === "unknown") return { error: "Origine du document non déclarée" };
  const scanning = await db.select({ id: docFiles.id }).from(docFiles).where(and(eq(docFiles.documentId, current.id), eq(docFiles.scanStatus, "pending"))).limit(1);
  if (scanning.length) return { error: "L’antivirus analyse encore un fichier joint" };
  await recordAttestation(user, "publish", current);
  const before = { published: current.published, publishedAt: current.publishedAt, reviewRequested: current.reviewRequested, reviewNote: current.reviewNote, postReviewAt: current.postReviewAt, reviewedBy: current.reviewedBy, reviewedAt: current.reviewedAt, hiddenByReports: current.hiddenByReports, quizStatus: current.quizStatus };
  const [doc] = await db.update(documents).set({ published: true, publishedAt: current.publishedAt ?? new Date(), reviewRequested: false, reviewNote: null, postReviewAt: null, reviewedBy: user.id, reviewedAt: new Date(), hiddenByReports: false, quizStatus: current.quizStatus === "none" ? "pending" : current.quizStatus, updatedAt: new Date() }).where(eq(documents.id, current.id)).returning();
  if (!doc) return { error: "Document introuvable" };
  const event = await addReviewEvent({ documentId: doc.id, authorId: user.id, kind: "published" });
  const authors = await authorsOf(doc.id, doc.createdBy);
  await audit(user.email, "document_publié", doc.title);
  const release = async () => {
    await afterPublished(doc.id);
    for (const author of authors) await syncBadges(author);
    // Se publier soi-même n'est pas une nouvelle
    for (const author of authors.filter((a) => a !== user.id)) await notify(author, {
      kind: "published", title: "Ton cours est publié", body: doc.title, href: `/d/${doc.id}`,
      mail: { subject: "ton cours est publié", transactional: true, text: `Ton cours « ${doc.title} » est maintenant en ligne.`, action: "Voir le cours" },
    });
  };
  refresh(doc.id, authors);
  if (!defer) { await release(); return { ok: true }; }
  holdDecision(`${user.id}:${doc.id}`, {
    release,
    revert: async () => {
      await db.update(documents).set(before).where(eq(documents.id, doc.id));
      await removeReviewEvent(event.id);
      await audit(user.email, "publication_annulée", doc.title);
      refresh(doc.id, authors);
    },
  });
  return { ok: true };
}

/** Formulaire historique (page d'un cours) : le motif est un texte libre. */
export async function rejectDocument(form: FormData) {
  const id = idOf(form);
  const { user, doc } = await moderated(id);
  const result = await sendBack(user, doc, reasonSchema.parse(Number(form.get("reason")) || undefined), str(form, "note").slice(0, 500), { defer: false });
  if ("error" in result) throw new Error("motif requis");
  redirect("/moderation");
}

/** Appelé aussi par l'éditeur (finishDocument) quand un modérateur publie son propre cours : garde la case « attest ». */
export async function publishDocument(form: FormData) {
  const id = idOf(form);
  const { user, doc } = await moderated(id);
  if (form.get("attest") !== "on") throw new Error("engagement non coché");
  const result = await publish(user, doc, { defer: false });
  if ("error" in result) throw new Error(result.error);
}

/** File « À valider » et barre de relecture. L'attestation est demandée une fois par séance ; chaque document garde sa preuve. */
export async function decideDocument(rawId: string, decision: "publish" | "reject", options: { reason?: number; word?: string; attest?: boolean } = {}): Promise<QueueResult> {
  const id = uuid.parse(rawId);
  const { user, doc } = await moderated(id);
  if (doc.published) return { error: "Déjà publié" };
  if (decision === "publish") {
    if (!options.attest) return { error: "Attestation requise" };
    return publish(user, doc, { defer: true });
  }
  return sendBack(user, doc, reasonSchema.parse(options.reason), wordSchema.parse(options.word) ?? "", { defer: true });
}

/** Annuler (Z ou le toast) : seulement une décision de cette personne, pendant quelques secondes. */
export async function undoReviewDecision(rawKey: string): Promise<QueueResult> {
  const user = await requireModerator();
  const key = z.string().max(80).parse(rawKey);
  return (await undoDecision(`${user.id}:${key}`)) ? { ok: true } : { error: "Trop tard pour annuler" };
}

/* Après coup : un cours mis en ligne par l’ancienne publication directe (avant la règle « toujours relu »), jamais relu */

export async function decideAfterPublication(rawId: string, decision: "keep" | "remove", options: { reason?: number; word?: string } = {}): Promise<QueueResult> {
  const id = uuid.parse(rawId);
  const { user, doc } = await moderated(id);
  if (!doc.postReviewAt) return { error: "Déjà relu" };
  const authors = await authorsOf(id, doc.createdBy);
  const before = { published: doc.published, postReviewAt: doc.postReviewAt, reviewNote: doc.reviewNote, reviewedBy: doc.reviewedBy, reviewedAt: doc.reviewedAt };
  let event: { id: string };
  let release: () => Promise<void>;
  if (decision === "keep") {
    await db.update(documents).set({ postReviewAt: null }).where(eq(documents.id, id));
    await markDocumentReviewed(id, user.id);
    event = await addReviewEvent({ documentId: id, authorId: user.id, kind: "post_ok" });
    await audit(user.email, "relecture_après_coup_ok", doc.title);
    release = async () => { for (const author of authors) await syncBadges(author); };
  } else {
    const word = wordSchema.parse(options.word) ?? "";
    const reason = reasonSchema.parse(options.reason);
    const note = reviewNoteOf(reason, word) || "Retiré après relecture : vérifie son contenu et son origine avant de le renvoyer.";
    // La note garde la trace du motif : il repasse par une validation
    await db.update(documents).set({ published: false, postReviewAt: null, reviewNote: note, updatedAt: new Date() }).where(eq(documents.id, id));
    event = await addReviewEvent({ documentId: id, authorId: user.id, kind: "removed", reasonCode: reason ?? null, body: word.trim() });
    await audit(user.email, "relecture_après_coup_retrait", doc.title);
    release = async () => {
      for (const author of authors) {
        await notify(author, { kind: "rejected", title: `« ${doc.title} » a été retiré après relecture`, body: note, href: `/editer/${id}` });
        await syncBadges(author);
      }
    };
  }
  refresh(id, authors);
  holdDecision(`${user.id}:${id}`, {
    release,
    revert: async () => {
      await db.update(documents).set(before).where(eq(documents.id, id));
      await removeReviewEvent(event.id);
      refresh(id, authors);
    },
  });
  return { ok: true };
}

/** « Marquer comme relu » de la barre de relecture, pour un cours en ligne jamais relu. */
export async function markReviewedNow(rawId: string): Promise<QueueResult> {
  const id = uuid.parse(rawId);
  const { user, doc } = await moderated(id);
  if (!doc.published || doc.reviewedAt) return { ok: true };
  if (doc.postReviewAt) return decideAfterPublication(id, "keep");
  await markDocumentReviewed(id, user.id);
  const event = await addReviewEvent({ documentId: id, authorId: user.id, kind: "post_ok" });
  await audit(user.email, "document_relu", doc.title);
  refresh(id, []);
  holdDecision(`${user.id}:${id}`, {
    revert: async () => {
      await db.update(documents).set({ reviewedBy: doc.reviewedBy, reviewedAt: doc.reviewedAt }).where(eq(documents.id, id));
      await removeReviewEvent(event.id);
      refresh(id, []);
    },
  });
  return { ok: true };
}

/* Corrections proposées par d'autres étudiants */

export async function decideRevision(rawId: string, decision: "accept" | "reject", options: { reason?: number; word?: string } = {}): Promise<QueueResult> {
  const id = uuid.parse(rawId);
  const [revision] = await db.select().from(revisions).where(eq(revisions.id, id));
  if (!revision || revision.status !== "pending") return { error: "Correction déjà traitée" };
  const { user, doc } = await moderated(revision.documentId);
  const accept = decision === "accept";
  const word = wordSchema.parse(options.word)?.trim() ?? "";
  const note = accept ? word || null : reviewNoteOf(reasonSchema.parse(options.reason), word) || null;
  await db.update(revisions).set({ status: accept ? "accepted" : "rejected", note }).where(eq(revisions.id, id));
  const previous = { bodyMarkdown: doc.bodyMarkdown, bodyBlocks: doc.bodyBlocks, bodyText: doc.bodyText, updatedAt: doc.updatedAt };
  let event: { id: string } | null = null;
  let joined = false;
  if (accept) {
    await db.update(documents).set({ bodyMarkdown: revision.bodyMarkdown, bodyBlocks: revision.bodyBlocks, bodyText: courseText(revision.bodyMarkdown), updatedAt: new Date() }).where(eq(documents.id, doc.id));
    await rebuildDocumentSearch(doc.id);
    const [proposer] = revision.authorId ? await db.select({ name: users.name, status: users.status }).from(users).where(eq(users.id, revision.authorId)) : [];
    event = await addReviewEvent({ documentId: doc.id, authorId: user.id, kind: "comment", body: `Modification ${proposer ? `de ${proposer.name} ` : ""}acceptée${revision.summary ? ` : ${revision.summary}` : ""}` });
    // La personne qui a proposé entre parmi les auteurs (marquée « correcteur » pour ses points)
    if (revision.authorId && proposer?.status === "active") joined = await addCorrector(doc.id, revision.authorId);
  }
  await audit(user.email, accept ? "correction_acceptée" : "correction_refusée", doc.title);
  forgetAllShellCounters();
  revalidatePath("/moderation");
  revalidatePath(`/d/${doc.id}`);
  holdDecision(`${user.id}:${id}`, {
    release: async () => {
      if (!revision.authorId) return;
      if (accept) {
        // Points d'une correction, trophée « Correcteur » et déblocages : tout se recalcule à partir des corrections acceptées
        await syncBadges(revision.authorId);
        forgetAuthorStats(revision.authorId);
        await notify(revision.authorId, {
          kind: "published", title: "Ta modification est acceptée", body: `${doc.title}${joined ? " · tu fais maintenant partie des auteurs" : ""}`, href: `/d/${doc.id}`,
          mail: { subject: "ta modification est acceptée", transactional: true, text: `Ta modification de « ${doc.title} » est en ligne.${joined ? " Tu fais maintenant partie de ses auteurs." : ""}${note ? `\n\nCommentaire : ${note}` : ""}`, action: "Voir le cours" },
        });
        return;
      }
      const [author] = await db.select().from(users).where(eq(users.id, revision.authorId));
      if (author) await queueMail(author.email, contentMails.proposalRejected(doc.title, note || null), { batch: true });
    },
    revert: async () => {
      await db.update(revisions).set({ status: "pending", note: null }).where(eq(revisions.id, id));
      if (accept) {
        await db.update(documents).set(previous).where(eq(documents.id, doc.id));
        await rebuildDocumentSearch(doc.id);
      }
      if (event) await removeReviewEvent(event.id);
      if (joined && revision.authorId) await removeCoauthor(doc.id, revision.authorId);
      forgetAllShellCounters();
      revalidatePath("/moderation");
    },
  });
  return { ok: true };
}

/** Formulaire historique, gardé pour les pages qui l'utilisent encore. */
export async function reviewRevision(form: FormData) {
  await decideRevision(idOf(form), form.get("decision") === "accept" ? "accept" : "reject", { word: str(form, "note").slice(0, 500) });
}

/* Fiches IA signalées */

export async function decideMemoCard(rawId: string, key: string, decision: "keep" | "remove"): Promise<QueueResult> {
  const id = uuid.parse(rawId);
  const card = z.string().length(32).parse(key);
  const { user, doc } = await moderated(id);
  const [report] = await db.select().from(memoCardReports).where(and(eq(memoCardReports.documentId, id), eq(memoCardReports.cardKey, card)));
  if (!report || report.status !== "open") return { error: "Fiche déjà traitée" };
  let removed: { front: string; back: string } | undefined;
  await db.transaction(async (tx) => {
    if (decision === "remove") {
      const [deck] = await tx.select({ cards: memoDecks.cards }).from(memoDecks).where(eq(memoDecks.documentId, id)).for("update");
      removed = deck?.cards.find((c) => cardKey(c.front) === card);
      if (deck) await tx.update(memoDecks).set({ cards: deck.cards.filter((c) => cardKey(c.front) !== card) }).where(eq(memoDecks.documentId, id));
    }
    await tx.update(memoCardReports).set({ status: decision === "remove" ? "removed" : "kept", updatedAt: new Date() }).where(and(eq(memoCardReports.documentId, id), eq(memoCardReports.cardKey, card)));
  });
  forgetAllShellCounters();
  await audit(user.email, decision === "remove" ? "fiche_ia_retirée" : "fiche_ia_gardée", doc.title);
  revalidatePath("/moderation");
  revalidatePath(`/d/${id}`);
  holdDecision(`${user.id}:${id}:${card}`, {
    revert: async () => {
      await db.transaction(async (tx) => {
        if (removed) {
          const [deck] = await tx.select({ cards: memoDecks.cards }).from(memoDecks).where(eq(memoDecks.documentId, id)).for("update");
          if (deck && !deck.cards.some((c) => cardKey(c.front) === card)) await tx.update(memoDecks).set({ cards: [...deck.cards, removed] }).where(eq(memoDecks.documentId, id));
        }
        await tx.update(memoCardReports).set({ status: "open", updatedAt: new Date() }).where(and(eq(memoCardReports.documentId, id), eq(memoCardReports.cardKey, card)));
      });
      forgetAllShellCounters();
      revalidatePath("/moderation");
    },
  });
  return { ok: true };
}

/* Enseignant */

/** Accord ou refus de l'enseignant rattaché : le refus retire le document immédiatement. */
export async function teacherDecision(form: FormData) {
  const user = await requireUser();
  if (user.role !== "teacher") throw new Error("accès refusé");
  const id = idOf(form);
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc || !(await canRead(user, doc))) throw new Error("accès refusé");
  const decision = z.enum(["authorized", "refused"]).parse(form.get("decision"));
  await db.update(documents).set(decision === "authorized"
    ? { teacherDecision: decision, rightsBasis: "authorized", hiddenByReports: false }
    : { teacherDecision: decision, published: false, hiddenByReports: true }).where(eq(documents.id, id));
  await db.insert(schema.attestations).values({ userId: user.id, userEmail: user.email, userName: user.name, kind: decision === "authorized" ? "teacher_ok" : "teacher_no", text: decision === "authorized" ? "L’enseignant autorise la diffusion de ce document sur Campuss." : "L’enseignant s’oppose à la diffusion de ce document sur Campuss.", documentId: doc.id, documentTitle: doc.title, termsVersion: TERMS_VERSION, ip: await clientIp() });
  await notifyAdmins(adminMails.teacherDecision(user.name, decision === "authorized", doc.title, doc.id));
  if (decision === "refused") {
    await mailAuthors(id, doc.createdBy, contentMails.removedByTeacher(doc.title));
    await addReviewEvent({ documentId: id, authorId: user.id, kind: "removed", body: "Retiré à la demande de l’enseignant de la matière" });
  }
  await audit(user.email, `enseignant_${decision}`, doc.title);
  revalidatePath("/enseignant");
}
