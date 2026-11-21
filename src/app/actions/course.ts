"use server";

import { trackEvent } from "@/lib/product-events";
import { addReviewEvent } from "@/lib/document-reviews";
import { addCoauthor as addCoauthorRow, removeCoauthor as removeCoauthorRow } from "@/lib/document-authors";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { publishDocument } from "@/app/actions/moderation";
import { missingDetails, type DetailKey } from "@/lib/doc-details";
import { canModerate } from "@/lib/access";
import { reusableEmptyDraft } from "@/lib/empty-draft";
import { canEdit, canRead, isDocAuthor, teachesSubject } from "@/lib/access-server";
import { afterPublished } from "@/lib/after-publish";
import { PENDING_PROPOSALS_PER_DOC, PROPOSALS_PER_DAY, PROPOSALS_PER_HOUR } from "@/lib/contribution-rules";
import { addShare, removeShare } from "@/lib/document-shares";
import { areFriends } from "@/lib/friends";
import { syncBadges } from "@/lib/gamification";
import { openNotesOf } from "@/lib/notes";
import { notify } from "@/lib/notify";
import { publishRoute } from "@/lib/publish-rules";
import { purgeRevisionFiles, revisionFileIdsOfDocument } from "@/lib/purge";
import { deleteKey, fileKey } from "@/lib/s3";
import { audit, requireUser } from "@/lib/auth";
import { blocksToMarkdown, sanitizeBlocks } from "@/lib/blocks";
import { courseText } from "@/lib/course";
import { db, schema } from "@/lib/db";
import { acceptedCategories, recordAttestation, rememberAcceptance } from "@/lib/attest-server";
import { CATEGORIES, RIGHTS, RIGHTS_FOR_EXAMS, type RightsBasis } from "@/lib/db/categories";
import type { Category, Document, User } from "@/lib/db/schema";
import { academicYearNow } from "@/lib/documents";
import { notifyAdmins, queueMail } from "@/lib/mail";
import { adminMails, contentMails } from "@/lib/mail/catalog";
import { rebuildDocumentSearch } from "@/lib/file-jobs";
import { similarTitles } from "@/lib/content-utils";
import { rateHit, rateLimited } from "@/lib/security";
import { forgetAllShellCounters } from "@/lib/shell-cache";

const { documents, subjects } = schema;

/**
 * Écrire d'abord : le document existe dès le clic, le reste se renseigne sur la page, et se vérifie à l'envoi.
 * Un brouillon resté vide est réutilisé plutôt que d'en empiler un nouveau.
 */
export async function createBlankDraft(rawSubject: string | null, startImport: boolean, shared = false): Promise<{ error: string } | never> {
  const user = await requireUser();
  const subjectId = rawSubject && /^\d+$/.test(rawSubject) ? Number(rawSubject) : null;
  const [subject] = subjectId ? await db.select().from(subjects).where(eq(subjects.id, subjectId)) : [];
  // Un enseignant écrit dans ses matières : celle demandée si elle est à lui, sinon la première
  const taught = user.role === "teacher" ? await db.select({ subject: subjects }).from(schema.subjectTeachers).innerJoin(subjects, eq(schema.subjectTeachers.subjectId, subjects.id)).where(eq(schema.subjectTeachers.userId, user.id)).orderBy(asc(subjects.name)) : [];
  if (user.role === "teacher" && !taught.length) return { error: "Aucune matière ne t’est rattachée : demande-le à l’équipe." };
  const allowed = user.role === "teacher" ? (taught.find((t) => t.subject.id === subject?.id) ?? taught[0]).subject
    : subject && (user.role === "admin" || subject.programId === user.programId) ? subject : null;
  const [fallback] = user.role === "admin" && !user.programId && !allowed ? await db.select({ id: schema.programs.id }).from(schema.programs).orderBy(asc(schema.programs.position)).limit(1) : [];
  const programId = allowed?.programId ?? user.programId ?? fallback?.id;
  if (!programId) return { error: "Ton compte n’est rattaché à aucune licence." };
  const suffix = shared ? "?partage=1" : startImport ? "?importer=1" : "";
  const [empty] = await db.select({ id: documents.id }).from(documents).where(reusableEmptyDraft(user.id, programId)).limit(1);
  if (empty) {
    if (allowed) await db.update(documents).set({ subjectId: allowed.id, programId: allowed.programId }).where(eq(documents.id, empty.id));
    redirect(`/editer/${empty.id}${suffix}`);
  }
  const key = `draft:${user.id}`;
  if (await rateLimited(key, 15, 1440)) return { error: "Tu as créé beaucoup de brouillons aujourd’hui. Réessaie demain." };
  const [doc] = await db.insert(documents).values({
    title: "", category: "cours", subjectId: allowed?.id ?? null, programId, kind: "editor", published: false, bodyMarkdown: "", createdBy: user.id, rightsBasis: "unknown", academicYear: academicYearNow(),
  }).returning({ id: documents.id });
  await rateHit(key);
  await audit(user.email, "brouillon_créé", doc.id);
  redirect(`/editer/${doc.id}${suffix}`);
}

async function editable(rawId: unknown) {
  const user = await requireUser();
  const id = z.uuid().parse(rawId);
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc || !(await canEdit(user, doc))) throw new Error("accès refusé");
  return { user, doc };
}

const detailsSchema = z.object({
  title: z.string().trim().max(200),
  subject: z.number().int().positive().nullable(),
  category: z.enum(Object.keys(CATEGORIES) as [Category, ...Category[]]),
  chapter: z.string().regex(/^$|^\d{1,3}$/),
  semester: z.string().regex(/^$|^[1-6]$/),
  rights: z.enum(["unknown", ...Object.keys(RIGHTS)] as [string, ...string[]]),
  teacher: z.string().trim().max(80).optional(),
});

/** Tout s'enregistre seul : ce qui manque ne bloque jamais l'écriture, seulement l'envoi. */
async function writeDocument(user: User, doc: Document, rawDetails: unknown, rawBlocks: unknown) {
  const parsed = detailsSchema.safeParse(rawDetails);
  if (!parsed.success) return "Vérifie le numéro de chapitre : il doit s’agir d’un nombre.";
  const details = parsed.data;
  const [subject] = details.subject ? await db.select().from(subjects).where(eq(subjects.id, details.subject)) : [];
  if (user.role === "teacher") {
    if (!subject || !(await teachesSubject(user.id, subject.id))) return "Choisis une de tes matières.";
  } else if (details.subject && (!subject || (user.role !== "admin" && subject.programId !== user.programId))) return "Choisis une matière de ta licence.";
  // Matière semestrielle : le semestre du document est celui de la matière, quoi que le navigateur envoie
  const semester = subject?.semester ?? (details.semester ? Number(details.semester) : null);
  const update: Partial<typeof documents.$inferInsert> = {
    title: details.title, subjectId: subject?.id ?? null, ...(subject ? { programId: subject.programId } : {}), category: details.category,
    chapter: details.chapter ? Number(details.chapter) : null, semester, rightsBasis: details.rights, updatedAt: new Date(),
    ...(details.teacher === undefined ? {} : { teacherName: details.teacher }),
  };
  if (Array.isArray(rawBlocks)) {
    const blocks = sanitizeBlocks(rawBlocks);
    const body = blocksToMarkdown(blocks);
    Object.assign(update, { bodyBlocks: blocks, bodyMarkdown: body, bodyText: courseText(body) });
  }
  await db.update(documents).set(update).where(eq(documents.id, doc.id));
  // Reconstruit l'index avec les fichiers joints : sinon chaque enregistrement effacerait le texte des PDF
  await rebuildDocumentSearch(doc.id);
  return null;
}

export async function saveDocument(rawId: string, details: unknown, blocks: unknown): Promise<{ error?: string }> {
  const { user, doc } = await editable(rawId);
  const error = await writeDocument(user, doc, details, blocks);
  return error ? { error } : {};
}

export async function removeDraftFile(form: FormData) {
  const { user, doc } = await editable(form.get("id"));
  const [file] = await db.delete(schema.docFiles).where(and(eq(schema.docFiles.id, z.uuid().parse(form.get("file"))), eq(schema.docFiles.documentId, doc.id))).returning();
  if (!file) return;
  await deleteKey(fileKey(file.id));
  await rebuildDocumentSearch(doc.id);
  await audit(user.email, "fichier_supprimé", file.filename);
  revalidatePath(`/editer/${doc.id}`);
}

/** Supprimer son brouillon, jamais un document déjà publié. */
export async function deleteDraft(form: FormData) {
  const { user, doc } = await editable(form.get("id"));
  if (doc.published) throw new Error("accès refusé");
  const files = await db.select({ id: schema.docFiles.id }).from(schema.docFiles).where(eq(schema.docFiles.documentId, doc.id));
  const photos = await revisionFileIdsOfDocument(doc.id);
  await db.delete(documents).where(eq(documents.id, doc.id));
  for (const file of files) await deleteKey(fileKey(file.id));
  await purgeRevisionFiles(photos);
  await audit(user.email, "brouillon_supprimé", doc.title || doc.id);
  redirect("/contribuer");
}

/** Gérer les auteurs : un auteur du document, ou l'administration. Un délégué qui relit le brouillon d'un autre n'en devient pas maître. */
async function authorManaged(rawId: unknown) {
  const { user, doc } = await editable(rawId);
  if (user.role !== "admin" && !(await isDocAuthor(user.id, doc))) throw new Error("accès refusé");
  return { user, doc };
}

export async function addCoauthor(form: FormData) {
  const { user, doc } = await authorManaged(form.get("id"));
  const [other] = await db.select().from(schema.users).where(eq(schema.users.id, z.uuid().parse(form.get("user"))));
  // Comme pour réviser : on ne coécrit qu'avec des amis, jamais en piochant dans la liste des inscrits
  if (other && other.programId === doc.programId && other.status === "active" && other.id !== doc.createdBy && (user.role === "admin" || await areFriends(user.id, other.id))) {
    await addCoauthorRow(doc.id, other.id);
    await queueMail(other.email, contentMails.coauthorAdded(user.name, doc.title, doc.id), { batch: true });
    if (await openNotesOf(doc.id)) await notify(other.id, { kind: "group", title: `${user.name} t’invite à prendre les notes du CM`, href: `/editer/${doc.id}` });
  }
  revalidatePath(`/editer/${doc.id}`);
}

export async function removeCoauthor(form: FormData) {
  const { doc } = await authorManaged(form.get("id"));
  await removeCoauthorRow(doc.id, z.uuid().parse(form.get("user")));
  revalidatePath(`/editer/${doc.id}`);
}

/* Partage en lecture à des amis choisis, même avant publication : le document est d'abord personnel */

async function sharedByAuthor(rawId: unknown, rawFriend: unknown) {
  const user = await requireUser();
  const id = z.uuid().parse(rawId);
  const friendId = z.uuid().parse(rawFriend);
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc || doc.deletedAt || !(await isDocAuthor(user.id, doc))) throw new Error("accès refusé");
  return { user, doc, friendId };
}

export async function shareWithFriend(rawId: string, rawFriend: string): Promise<{ error?: string }> {
  const { user, doc, friendId } = await sharedByAuthor(rawId, rawFriend);
  if (doc.hiddenByReports) return { error: "Ce document est masqué : il ne peut pas être partagé." };
  // Seulement un ami, jamais une personne piochée dans la liste des inscrits
  if (friendId === user.id || !(await areFriends(user.id, friendId))) return { error: "Tu ne peux partager qu’avec tes amis." };
  const [friend] = await db.select({ status: schema.users.status }).from(schema.users).where(eq(schema.users.id, friendId));
  if (friend?.status !== "active") return { error: "Ce compte n’est pas actif." };
  const key = `share-doc:${user.id}`;
  if (await rateLimited(key, 60, 1440)) return { error: "Beaucoup de partages aujourd’hui. Réessaie demain." };
  await rateHit(key);
  if (await addShare(doc.id, friendId, user.id)) {
    await notify(friendId, { kind: "friend", title: `${user.name} partage un cours avec toi`, body: doc.title || "Sans titre", href: `/d/${doc.id}`, dedupeKey: `share:${doc.id}:${friendId}` });
  }
  revalidatePath(`/d/${doc.id}`);
  return {};
}

export async function unshareWithFriend(rawId: string, rawFriend: string): Promise<{ error?: string }> {
  const { doc, friendId } = await sharedByAuthor(rawId, rawFriend);
  await removeShare(doc.id, friendId);
  revalidatePath(`/d/${doc.id}`);
  return {};
}

/**
 * Un cours publié ne change pas directement : n'importe quel lecteur propose une modification (texte, éléments),
 * un délégué ou l'administration la valide dans la file de relecture.
 */
export async function proposeRevision(rawId: string, rawBlocks: unknown, summary: string, attested: boolean): Promise<{ error?: string }> {
  const user = await requireUser();
  const id = z.uuid().parse(rawId);
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc?.published || doc.kind !== "editor" || doc.deletedAt || doc.hiddenByReports) return { error: "Ce cours ne peut pas être modifié ici." };
  if (!(await canRead(user, doc))) return { error: "Ce cours ne peut pas être modifié ici." };
  if (!attested && !(await acceptedCategories(user.id, "share")).includes(doc.category)) return { error: "Coche l’engagement pour envoyer ta proposition." };
  const [waiting] = await db.select({ n: count() }).from(schema.revisions).where(and(eq(schema.revisions.documentId, id), eq(schema.revisions.authorId, user.id), eq(schema.revisions.status, "pending")));
  if (waiting.n >= PENDING_PROPOSALS_PER_DOC) return { error: "Tes propositions sur ce cours attendent encore leur relecture." };
  const hour = `revision-h:${user.id}`;
  const day = `revision:${user.id}`;
  if (await rateLimited(hour, PROPOSALS_PER_HOUR, 60)) return { error: "Plusieurs propositions en une heure : réessaie un peu plus tard." };
  if (await rateLimited(day, PROPOSALS_PER_DAY, 1440)) return { error: "Trop de propositions aujourd’hui. Réessaie demain." };
  const blocks = sanitizeBlocks(rawBlocks);
  const markdown = blocksToMarkdown(blocks);
  if (!markdown.trim()) return { error: "Le cours ne peut pas être vide." };
  if (markdown === (doc.bodyMarkdown ?? "")) return { error: "Tu n’as rien modifié." };
  await rateHit(hour);
  await rateHit(day);
  await db.insert(schema.revisions).values({ documentId: id, authorId: user.id, bodyMarkdown: markdown, bodyBlocks: blocks, summary: summary.trim().slice(0, 300) });
  await recordAttestation(user, "share", doc);
  if (attested) await rememberAcceptance(user.id, "share", doc.category);
  forgetAllShellCounters();
  await notifyAdmins(adminMails.editToReview(doc.title));
  return {};
}

export type FinishResult = { error?: string; missing?: DetailKey[]; duplicate?: string; published?: boolean; attest?: boolean };

/** Le seul bouton d'envoi : il vérifie tout d'un coup, et publie directement pour qui peut valider. */
export async function finishDocument(rawId: string, details: unknown, blocks: unknown, options: { attested: boolean; notDuplicate: boolean }): Promise<FinishResult> {
  const { user, doc } = await editable(rawId);
  const error = await writeDocument(user, doc, details, blocks);
  if (error) return { error };
  const [current] = await db.select().from(documents).where(eq(documents.id, doc.id));
  // Vérifié à l'envoi (relecture ou publication), jamais à l'enregistrement : les brouillons existants restent intacts
  const missing = missingDetails({ title: current.title, subjectId: current.subjectId, rights: current.rightsBasis, category: current.category, chapter: current.chapter, semester: current.semester, teacherName: current.teacherName }, { teacher: user.role === "teacher" });
  if (missing.length) return { missing };
  if (current.category === "partiel" && !RIGHTS_FOR_EXAMS.includes(current.rightsBasis as RightsBasis)) return { error: "Un sujet de partiel appartient à son auteur : il faut son accord, ou qu’il soit déjà public." };
  if (!options.notDuplicate) {
    const siblings = await db.select({ id: documents.id, title: documents.title }).from(documents).where(and(eq(documents.subjectId, current.subjectId!), and(eq(documents.published, true), isNull(documents.deletedAt))));
    const close = siblings.find((other) => other.id !== current.id && similarTitles(other.title, current.title));
    if (close) return { duplicate: close.title };
  }
  // Un cours est toujours relu avant publication : seuls l'administration, le délégué (qui publie en modérant) et
  // l'enseignant dans ses matières le mettent en ligne eux-mêmes (lib/publish-rules.ts)
  const teacherOwnCourse = user.role === "teacher" && current.createdBy === user.id && await teachesSubject(user.id, current.subjectId);
  const route = publishRoute(user, { canModerate: canModerate(user, current), teacherOwnCourse });
  // Relire le brouillon d'un autre reste un engagement au cas par cas : la mémoire ne vaut que pour ses propres contenus
  const kind = route === "moderate" ? "publish" as const : "share" as const;
  const mine = await isDocAuthor(user.id, current);
  if (!options.attested && !(mine && (await acceptedCategories(user.id, kind)).includes(current.category))) return { attest: true };
  const remember = options.attested && mine ? () => rememberAcceptance(user.id, kind, current.category) : async () => undefined;
  if (kind === "publish") {
    const scanning = await db.select({ id: schema.docFiles.id }).from(schema.docFiles).where(and(eq(schema.docFiles.documentId, current.id), eq(schema.docFiles.scanStatus, "pending"))).limit(1);
    if (scanning.length) return { error: "L’antivirus analyse encore un fichier joint. Réessaie dans un instant." };
    const form = new FormData();
    form.set("id", current.id);
    form.set("attest", "on");
    await publishDocument(form);
    await remember();
    await trackEvent("doc_submitted", user);
    return { published: true };
  }
  // Cours de l'enseignant : publié directement dans sa matière, sans relecture après coup
  if (route === "teacher") {
    const scanning = await db.select({ id: schema.docFiles.id }).from(schema.docFiles).where(and(eq(schema.docFiles.documentId, current.id), eq(schema.docFiles.scanStatus, "pending"))).limit(1);
    if (scanning.length) return { error: "L’antivirus analyse encore un fichier joint. Réessaie dans un instant." };
    await recordAttestation(user, "share", current);
    await remember();
    await addReviewEvent({ documentId: current.id, authorId: user.id, kind: "sent" });
    await db.update(documents).set({ published: true, publishedAt: current.publishedAt ?? new Date(), postReviewAt: null, reviewRequested: false, reviewNote: null, quizStatus: current.quizStatus === "none" ? "pending" : current.quizStatus, updatedAt: new Date() }).where(eq(documents.id, current.id));
    forgetAllShellCounters();
    await afterPublished(current.id);
    await syncBadges(user.id);
    await audit(user.email, "publication_enseignant", current.title);
    await trackEvent("doc_submitted", user);
    revalidatePath(`/d/${current.id}`);
    return { published: true };
  }
  await recordAttestation(user, "share", current);
  await remember();
  await addReviewEvent({ documentId: current.id, authorId: user.id, kind: current.reviewNote || current.reviewRequested ? "resubmitted" : "sent" });
  // Renvoyer un cours déjà en attente ne remet pas le compteur à zéro : le délai se compte depuis la première demande
  const waiting = current.reviewRequested && current.reviewRequestedAt;
  await db.update(documents).set({ reviewRequested: true, reviewNote: null, reviewRequestedAt: waiting || new Date(), reviewReminderAt: waiting ? current.reviewReminderAt : null }).where(eq(documents.id, current.id));
  forgetAllShellCounters();
  await notifyAdmins(adminMails.courseToValidate(current.title, current.id));
  await audit(user.email, "validation_demandée", current.title);
  await trackEvent("doc_submitted", user);
  revalidatePath(`/editer/${current.id}`);
  return {};
}


export async function setCover(rawId: string, fileId: string | null) {
  const user = await requireUser();
  const id = z.uuid().parse(rawId);
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, id));
  if (!doc || !(await canEdit(user, doc))) throw new Error("accès refusé");
  await db.update(schema.documents).set({ coverFileId: fileId === null ? null : z.uuid().parse(fileId) }).where(eq(schema.documents.id, id));
  revalidatePath(`/editer/${id}`);
}
