"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canModerate } from "@/lib/access";
import { audit, requireUser } from "@/lib/auth";
import { similarTitles } from "@/lib/content-utils";
import { chapterOf, cleanRequestText, needText, sameNumbers } from "@/lib/course-request-rules";
import { WANTED } from "@/lib/coverage-rules";
import { db, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { academicYearNow } from "@/lib/documents";
import { rateHit, rateLimited } from "@/lib/security";
import { HOME } from "@/lib/home";

const { courseRequests, courseRequestVotes, documents, subjects } = schema;

async function subjectFor(user: User, id: number) {
  const [subject] = await db.select().from(subjects).where(eq(subjects.id, id));
  return subject && (user.role === "admin" || subject.programId === user.programId) ? subject : null;
}

/** La demande et sa matière, si ce compte y a accès : une autre licence n'existe pas pour lui. */
async function reachable(user: User, rawId: unknown) {
  const id = z.uuid().parse(rawId);
  const [row] = await db.select({ request: courseRequests, subject: subjects }).from(courseRequests).innerJoin(subjects, eq(courseRequests.subjectId, subjects.id)).where(eq(courseRequests.id, id));
  if (!row || (user.role !== "admin" && row.subject.programId !== user.programId)) throw new Error("accès refusé");
  return row;
}

const refresh = (subjectId: number) => { revalidatePath(`/matieres/${subjectId}`); revalidatePath("/demandes"); revalidatePath(HOME); };

export async function createCourseRequest(rawSubject: number, rawText: string, rawCategory?: string): Promise<{ error?: string; merged?: boolean; id?: string }> {
  const user = await requireUser();
  const subject = await subjectFor(user, z.number().int().positive().parse(rawSubject));
  if (!subject) return { error: "Choisis une matière de ta licence" };
  const text = cleanRequestText(rawText);
  if (!text) return { error: "Écris ta demande en une ligne : quel cours cherches-tu ?" };
  const category = WANTED.find((c) => c === rawCategory) ?? null;
  const key = `course-request:${user.id}`;
  if (await rateLimited(key, 5, 1440)) return { error: "Tu as fait beaucoup de demandes aujourd’hui. Réessaie demain." };
  await rateHit(key);
  // La même demande existe déjà : mieux vaut une voix de plus qu'une ligne de plus
  const existing = await db.select({ id: courseRequests.id, text: courseRequests.text }).from(courseRequests).where(and(eq(courseRequests.subjectId, subject.id), isNull(courseRequests.answeredAt), isNull(courseRequests.mergedInto)));
  const twin = existing.find((other) => sameNumbers(other.text, text) && similarTitles(other.text, text));
  if (twin) {
    await db.insert(courseRequestVotes).values({ requestId: twin.id, userId: user.id }).onConflictDoNothing();
    refresh(subject.id);
    return { merged: true, id: twin.id };
  }
  const [request] = await db.insert(courseRequests).values({ subjectId: subject.id, authorId: user.id, text, category, chapter: Number(chapterOf(text)) || null }).returning({ id: courseRequests.id });
  await db.insert(courseRequestVotes).values({ requestId: request.id, userId: user.id });
  refresh(subject.id);
  return { id: request.id };
}

/** Un besoin détecté (« Aucun partiel en Statistiques ») devient une vraie demande au premier vote. */
export async function voteNeed(rawSubject: number, rawCategory: string): Promise<{ error?: string; id?: string }> {
  const user = await requireUser();
  const subject = await subjectFor(user, z.number().int().positive().parse(rawSubject));
  const category = WANTED.find((c) => c === rawCategory);
  if (!subject || !category) return { error: "Besoin introuvable" };
  const [open] = await db.select({ id: courseRequests.id }).from(courseRequests)
    .where(and(eq(courseRequests.subjectId, subject.id), eq(courseRequests.category, category), isNull(courseRequests.answeredAt), isNull(courseRequests.mergedInto))).limit(1);
  if (open) {
    await db.insert(courseRequestVotes).values({ requestId: open.id, userId: user.id }).onConflictDoNothing();
    refresh(subject.id);
    return { id: open.id };
  }
  return createCourseRequest(subject.id, needText(category, subject.name), category);
}

/** Une voix par compte, garantie par la clé primaire. Renvoie l'état réel, que le navigateur reprend. */
export async function toggleRequestVote(rawId: string): Promise<{ voted: boolean }> {
  const user = await requireUser();
  const { request, subject } = await reachable(user, rawId);
  const key = `course-vote:${user.id}`;
  const removed = await db.delete(courseRequestVotes).where(and(eq(courseRequestVotes.requestId, request.id), eq(courseRequestVotes.userId, user.id))).returning();
  if (!removed.length) {
    if (await rateLimited(key, 60, 60)) return { voted: false };
    await rateHit(key);
    await db.insert(courseRequestVotes).values({ requestId: request.id, userId: user.id }).onConflictDoNothing();
  }
  refresh(subject.id);
  return { voted: !removed.length };
}

export async function deleteCourseRequest(form: FormData) {
  const user = await requireUser();
  const { request, subject } = await reachable(user, form.get("id"));
  if (request.authorId !== user.id && !canModerate(user, subject)) throw new Error("accès refusé");
  await db.delete(courseRequests).where(eq(courseRequests.id, request.id));
  await audit(user.email, "demande_supprimée", request.text);
  refresh(subject.id);
}

/** « J'ai ce cours » : son brouillon sur cette demande s'il existe, sinon un nouveau, déjà rangé dans la bonne matière. */
export async function draftForRequest(form: FormData) {
  const user = await requireUser();
  const { request, subject } = await reachable(user, form.get("id"));
  const [existing] = await db.select({ id: documents.id }).from(documents).where(and(eq(documents.courseRequestId, request.id), eq(documents.createdBy, user.id), eq(documents.published, false)));
  if (existing) redirect(`/editer/${existing.id}`);
  const key = `draft:${user.id}`;
  if (await rateLimited(key, 15, 1440)) throw new Error("trop de brouillons aujourd’hui");
  await rateHit(key);
  const chapter = chapterOf(request.text);
  const [doc] = await db.insert(documents).values({
    title: "", category: "cours", subjectId: subject.id, programId: subject.programId, chapter: chapter ? Number(chapter) : null, kind: "editor", published: false, bodyMarkdown: "", createdBy: user.id, rightsBasis: "unknown", academicYear: academicYearNow(), courseRequestId: request.id,
  }).returning({ id: documents.id });
  await audit(user.email, "brouillon_créé", doc.id);
  redirect(`/editer/${doc.id}`);
}
