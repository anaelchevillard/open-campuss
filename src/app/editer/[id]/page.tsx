import { asc, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DocEditor } from "@/components/doc-editor";
import { ReviewThread } from "@/components/review/review-thread";
import { NotesEditor } from "@/components/notes-editor";
import { Shell } from "@/components/shell";
import { canModerate } from "@/lib/access";
import { canEdit, isDocAuthor, teachesSubject } from "@/lib/access-server";
import { aiUsage } from "@/lib/ai-quota-server";
import { acceptedCategories } from "@/lib/attest-server";
import { requireUser } from "@/lib/auth";
import { markdownToBlocks } from "@/lib/blocks";
import { subjectOptions, yearLimited } from "@/lib/catalog";
import { db, schema } from "@/lib/db";
import { formatSize } from "@/lib/documents";
import { env } from "@/lib/env";
import { friendsOf } from "@/lib/friends";
import { reviewWaitMessage } from "@/lib/review-wait";
import { openNotesOf } from "@/lib/notes";
import { publishRoute } from "@/lib/publish-rules";
import { aiAvailable } from "@/lib/ai-available";

export const metadata: Metadata = { title: "Rédiger" };

export default async function EditCoursePage({ params, searchParams }: PageProps<"/editer/[id]">) {
  const user = await requireUser();
  const { importer, partage, depart } = await searchParams;
  const startImport = importer === "1";
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, id));
  if (!doc || !(await canEdit(user, doc))) notFound();
  // Un étudiant rédige dans les matières de son année ; celle du cours reste proposée si elle est d'une autre année
  const options = await subjectOptions(user, { ownYear: true, keep: doc.subjectId });
  // Le semestre d'une matière semestrielle n'est pas demandé : il est celui de la matière
  const terms = options.length ? await db.select({ id: schema.subjects.id, semester: schema.subjects.semester }).from(schema.subjects).where(inArray(schema.subjects.id, options.map((s) => s.id))) : [];
  const subjects = options.map((s) => ({ ...s, semester: terms.find((t) => t.id === s.id)?.semester ?? null }));
  const [program] = await db.select({ name: schema.programs.name }).from(schema.programs).where(eq(schema.programs.id, doc.programId));
  const files = (await db.select().from(schema.docFiles).where(eq(schema.docFiles.documentId, id)).orderBy(asc(schema.docFiles.filename))).filter((f) => !f.embedded);
  const coauthors = await db.select({ id: schema.users.id, name: schema.users.name, avatarKey: schema.users.avatarKey }).from(schema.docAuthors).innerJoin(schema.users, eq(schema.docAuthors.userId, schema.users.id)).where(eq(schema.docAuthors.documentId, id));
  const [author] = doc.createdBy ? await db.select({ id: schema.users.id, name: schema.users.name, avatarKey: schema.users.avatarKey }).from(schema.users).where(eq(schema.users.id, doc.createdBy)) : [];
  const authored = await isDocAuthor(user.id, doc);
  // Seul un auteur ajoute des co-auteurs, et seulement parmi ses amis (l'administration passe par sa fiche)
  const friends = authored ? (await friendsOf(user.id)).filter((f) => f.programId === doc.programId && f.id !== doc.createdBy).map((f) => ({ id: f.id, name: f.name, avatarKey: f.avatarKey })) : [];
  const canPublish = canModerate(user, doc);
  const aiReady = await aiAvailable();
  // Comme la route de transcription : ses propres brouillons, et un administrateur partout
  const canOcr = aiReady && (user.role === "admin" || (authored && !doc.published));
  const ocrAccepted = canOcr && (await acceptedCategories(user.id, "ocr")).length > 0;
  const [notes, teacherOwnCourse, [request]] = await Promise.all([
    openNotesOf(id),
    user.role === "teacher" && doc.createdBy === user.id ? teachesSubject(user.id, doc.subjectId) : false,
    doc.courseRequestId ? db.select({ text: schema.courseRequests.text, subjectId: schema.courseRequests.subjectId }).from(schema.courseRequests).where(eq(schema.courseRequests.id, doc.courseRequestId)) : [],
  ]);
  const shared = {
    docId: doc.id, mode: "draft" as const, program: program?.name ?? "", year: doc.academicYear,
    fields: { title: doc.title, subject: doc.subjectId, category: doc.category, chapter: doc.chapter ? String(doc.chapter) : "", semester: doc.semester ? String(doc.semester) : "", rights: doc.rightsBasis, teacher: doc.teacherName },
    published: doc.published, reviewRequested: doc.reviewRequested, reviewNote: doc.reviewNote, coverFileId: doc.coverFileId,
    author: author ?? { id: user.id, name: user.name, avatarKey: user.avatarKey }, coauthors, friends, subjects,
    // Un étudiant rédige dans son année : elle s'affiche, verrouillée ; l'enseignant n'a pas à remplir chapitre, semestre ni enseignant
    lockedLevel: yearLimited(user) ? user.level : null, detailsOptional: user.role === "teacher",
    files: files.map((f) => ({ id: f.id, filename: f.filename, size: formatSize(f.size), scanning: f.scanStatus === "pending" })),
    canPublish, canOcr, notionReady: user.role === "admin" && Boolean(env.notionToken), startImport, startShare: partage === "1",
    aiReady: aiReady && authored && !doc.published, pagesLeft: canOcr ? (await aiUsage(user)).left.pages : null, ocrAccepted, acceptedCategories: authored ? await acceptedCategories(user.id, canPublish ? "publish" : "share") : [],
    reviewWait: doc.reviewRequested ? reviewWaitMessage(doc.reviewRequestedAt) : null,
    // Le navigateur ne fait qu'adapter le bouton quand le type change ; finishDocument revérifie tout
    canDirect: publishRoute(user, { canModerate: canPublish, teacherOwnCourse }) === "teacher",
    answering: request && request.subjectId === doc.subjectId ? request.text : null,
    initial: doc.bodyBlocks ?? markdownToBlocks(doc.bodyMarkdown ?? ""),
    depart: (["photo", "notion", "google", "fichier"] as const).find((d) => d === depart),
    reviewThread: doc.reviewNote ? <ReviewThread documentId={doc.id} compact /> : undefined,
  };
  return (
    <Shell user={user} width="reading">
      {notes
        ? <NotesEditor {...shared} me={{ id: user.id, name: user.name }} turns={notes.turns} canOrganize={canModerate(user, doc) || notes.startedBy === user.id} seeds={doc.createdBy === user.id} openGroup={notes.open} />
        : <DocEditor {...shared} />}
    </Shell>
  );
}
