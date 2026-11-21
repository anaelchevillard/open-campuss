"use server";

import { and, eq, gt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { afterPublished } from "@/lib/after-publish";
import { canModerate } from "@/lib/access";
import { audit, requireAdmin, requireFreshAdmin, requireModerator } from "@/lib/auth";
import { rebuildDocumentSearch } from "@/lib/file-jobs";
import type { StepUpRequired } from "@/lib/step-up";
import { ingestText } from "@/lib/content";
import { ContentError, detectKind, isHttpUrl, parseNotionId } from "@/lib/content-utils";
import { db, schema } from "@/lib/db";
import { recordAttestation } from "@/lib/attest-server";
import { CATEGORIES, RIGHTS, RIGHTS_FOR_EXAMS, type RightsBasis } from "@/lib/db/categories";
import { syncBadges } from "@/lib/gamification";
import { forgetAllShellCounters } from "@/lib/shell-cache";
import { courseTemplate } from "@/lib/course-template";
import type { Category } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { notify } from "@/lib/notify";
import { purgeRevisionFiles, revisionFileIdsOfDocument } from "@/lib/purge";
import { deleteKey, deletePrefix, docPrefix, fileKey } from "@/lib/s3";
import { trashDocument } from "@/lib/trash";

const { documents, docFiles, subjects } = schema;

const uuid = z.uuid();

export type SaveResult = { id?: string; error?: string; edit?: boolean };

const idOf = (form: FormData, name = "id") => {
  const parsed = uuid.safeParse(form.get(name));
  if (!parsed.success) throw new Error("identifiant invalide");
  return parsed.data;
};

const fieldsSchema = z.object({
  title: z.string().trim().min(1, "Indique un titre.").max(200),
  category: z.enum(Object.keys(CATEGORIES) as [Category, ...Category[]], { message: "Choisis un type de document." }),
  subject: z.string().regex(/^\d{1,9}$/, "Choisis une matière."),
  chapter: z.string().regex(/^$|^\d{1,3}$/, "Le numéro de chapitre doit être un nombre."),
  academicYear: z.string().trim().regex(/^$|^\d{4}(-\d{4})?$/, "Année attendue au format 2025-2026."),
  description: z.string().trim().max(5000),
  externalUrl: z.string().trim().max(1024).refine((v) => !v || isHttpUrl(v), "Le lien externe doit commencer par http:// ou https://."),
  published: z.boolean(),
  rights: z.enum(Object.keys(RIGHTS) as [RightsBasis, ...RightsBasis[]], { message: "Indique l’origine du document." }),
  teacherName: z.string().trim().max(80),
});

const str = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

export async function saveDocument(form: FormData): Promise<SaveResult> {
  const admin = await requireAdmin();
  const parsed = fieldsSchema.safeParse({
    title: str(form, "title"), category: str(form, "category"), subject: str(form, "subject"), chapter: str(form, "chapter"),
    academicYear: str(form, "academicYear"), description: str(form, "description"),
    externalUrl: str(form, "externalUrl"), published: form.get("published") === "on", rights: str(form, "rights"), teacherName: str(form, "teacherName"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const fields = parsed.data;
  if (form.get("attest") !== "on") return { error: "Coche l’engagement pour enregistrer ce document." };
  if (fields.category === "partiel" && !RIGHTS_FOR_EXAMS.includes(fields.rights)) return { error: "Un sujet de partiel appartient à son auteur : il faut son accord, ou qu’il soit déjà public." };
  const [subject] = await db.select().from(subjects).where(eq(subjects.id, Number(fields.subject)));
  if (!subject) return { error: "Choisis une matière." };

  const values = {
    title: fields.title, category: fields.category, subjectId: subject.id, programId: subject.programId, academicYear: fields.academicYear, teacherName: fields.teacherName,
    chapter: fields.chapter ? Number(fields.chapter) : null, description: fields.description,
    externalUrl: fields.externalUrl || null, published: fields.published, rightsBasis: fields.rights, updatedAt: new Date(),
  };

  const source = str(form, "source");
  const pasted = str(form, "pasted");
  const notionId = source === "notion" ? parseNotionId(str(form, "notionUrl")) : null;
  if (source === "notion" && !notionId) return { error: "Lien Notion non reconnu : copie le lien complet de la page." };
  if (source === "notion" && !env.notionToken) return { error: "Notion n’est pas encore configuré sur le serveur." };
  if (source === "paste" && !pasted.trim()) return { error: "Colle le code de la page ou de l’artefact." };

  const existingId = form.get("id") ? idOf(form) : null;
  let id: string;
  if (existingId) {
    const [row] = await db.update(documents).set(values).where(eq(documents.id, existingId)).returning();
    if (!row) return { error: "Document introuvable." };
    id = row.id;
  } else {
    [{ id }] = await db.insert(documents).values({ ...values, createdBy: admin.id }).returning({ id: documents.id });
  }

  try {
    if (source === "paste") {
      await ingestText(id, pasted, fields.title, detectKind(pasted));
    } else if (source === "write") {
      await db.update(documents).set({
        kind: "editor", contentVersion: null, entryPath: null, notionPageId: null, syncError: null, syncedAt: null,
        bodyMarkdown: sql`coalesce(${documents.bodyMarkdown}, ${courseTemplate(fields.category)})`,
      }).where(eq(documents.id, id));
    } else if (source === "notion") {
      await db.update(documents).set({
        kind: "notion", notionPageId: notionId, syncRequested: true, syncError: null, syncedAt: null, entryPath: null,
      }).where(eq(documents.id, id));
    } else if (source === "none") {
      await db.update(documents).set({
        kind: "none", contentVersion: null, entryPath: null, notionPageId: null, bodyText: "", bodyMarkdown: null, syncError: null, syncedAt: null,
      }).where(eq(documents.id, id));
      await deletePrefix(docPrefix(id));
    }
  } catch (error) {
    if (error instanceof ContentError) {
      if (!existingId) await db.delete(documents).where(eq(documents.id, id));
      return { error: error.message };
    }
    throw error;
  }
  // Publié directement : même suite qu'une validation, dont le quiz généré une seule fois
  if (fields.published) {
    await db.update(documents).set({ publishedAt: sql`coalesce(${documents.publishedAt}, now())`, reviewedBy: sql`coalesce(${documents.reviewedBy}, ${admin.id}::uuid)`, reviewedAt: sql`coalesce(${documents.reviewedAt}, now())`, quizStatus: sql`case when ${documents.quizStatus} = 'none' then 'pending' else ${documents.quizStatus} end` }).where(eq(documents.id, id));
  }
  await rebuildSearch(id);
  await recordAttestation(admin, "share", { id, title: fields.title });
  await audit(admin.email, existingId ? "document_modifié" : "document_créé", fields.title);
  return { id, edit: source === "write" };
}

async function moderated(id: string) {
  const user = await requireModerator();
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc || !canModerate(user, doc)) throw new Error("accès refusé");
  return { user, doc };
}

async function authorsOf(documentId: string, createdBy: string | null) {
  const extra = await db.select({ id: schema.docAuthors.userId }).from(schema.docAuthors).where(eq(schema.docAuthors.documentId, documentId));
  return [...new Set([...(createdBy ? [createdBy] : []), ...extra.map((a) => a.id)])];
}

export async function bulkDocuments(form: FormData) {
  const user = await requireModerator();
  const ids = z.array(z.uuid()).max(200).parse(form.getAll("doc"));
  const action = z.enum(["publish", "unpublish"]).parse(form.get("bulk"));
  if (action === "publish" && form.get("attest") !== "on") throw new Error("engagement non coché");
  for (const id of ids) {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    if (!doc || !canModerate(user, doc)) continue;
    if (action === "publish") {
      if (doc.rightsBasis === "unknown" || doc.published) continue;
      await recordAttestation(user, "publish", doc);
      await db.update(documents).set({ published: true, publishedAt: doc.publishedAt ?? new Date(), reviewRequested: false, reviewNote: null, postReviewAt: null, reviewedBy: user.id, reviewedAt: new Date(), hiddenByReports: false, quizStatus: doc.quizStatus === "none" ? "pending" : doc.quizStatus, updatedAt: new Date() }).where(eq(documents.id, id));
      await afterPublished(id);
      for (const author of await authorsOf(id, doc.createdBy)) {
        await syncBadges(author);
        if (author !== user.id) await notify(author, { kind: "published", title: "Ton cours est publié", body: doc.title, href: `/d/${doc.id}`, mail: { subject: "ton cours est publié", transactional: true, text: `Ton cours « ${doc.title} » est maintenant en ligne.`, action: "Voir le cours" } });
      }
    } else {
      await db.update(documents).set({ published: false, updatedAt: new Date() }).where(eq(documents.id, id));
    }
  }
  forgetAllShellCounters();
  await audit(user.email, action === "publish" ? "publication_en_masse" : "dépublication_en_masse", `${ids.length} documents`);
  revalidatePath("/moderation");
  revalidatePath("/admin/contenus");
}

export async function restoreDocument(form: FormData) {
  const id = idOf(form);
  const { user, doc } = await moderated(id);
  await db.update(documents).set({ hiddenByReports: false }).where(eq(documents.id, id));
  await audit(user.email, "document_rétabli", doc.title);
  revalidatePath("/admin/moderation");
}

const rebuildSearch = (id: string) => rebuildDocumentSearch(id);

export async function deleteDocument(form: FormData): Promise<StepUpRequired | void> {
  const admin = await requireFreshAdmin();
  if ("stepUp" in admin) return admin;
  // Corbeille de 30 jours : la suppression définitive passe par purgeExpiredTrash
  const doc = await trashDocument(idOf(form), admin.id);
  if (!doc) return;
  await audit(admin.email, "document_corbeille", doc.title);
  redirect("/admin/contenus");
}

/** Un nouveau document dont l'import a échoué ne doit pas rester publié, vide, dans la bibliothèque. */
export async function discardNewDocument(rawId: string) {
  const admin = await requireAdmin();
  const id = uuid.parse(rawId);
  // Limité à ce que cet admin vient de créer : sinon ce serait une suppression sans double authentification
  const [mine] = await db.select({ id: documents.id }).from(documents).where(and(eq(documents.id, id), eq(documents.createdBy, admin.id), gt(documents.createdAt, new Date(Date.now() - 3_600_000))));
  if (!mine) return;
  const files = await db.select({ id: docFiles.id }).from(docFiles).where(eq(docFiles.documentId, id));
  const photos = await revisionFileIdsOfDocument(id);
  await db.delete(documents).where(eq(documents.id, id));
  await deletePrefix(docPrefix(id));
  await Promise.all(files.map((f) => deleteKey(fileKey(f.id))));
  await purgeRevisionFiles(photos);
}

export async function requestSync(form: FormData) {
  await requireAdmin();
  const id = idOf(form);
  await db.update(documents).set({ syncRequested: true }).where(eq(documents.id, id));
  revalidatePath(`/admin/documents/${id}`);
}

export async function deleteFile(form: FormData): Promise<StepUpRequired | void> {
  const admin = await requireFreshAdmin();
  if ("stepUp" in admin) return admin;
  const id = idOf(form);
  const [file] = await db.delete(docFiles).where(eq(docFiles.id, id)).returning();
  if (!file) return;
  await deleteKey(fileKey(file.id));
  await rebuildSearch(file.documentId);
  await audit(admin.email, "fichier_supprimé", file.filename);
  revalidatePath(`/admin/documents/${file.documentId}`);
}
