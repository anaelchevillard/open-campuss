import "server-only";
import { and, desc, eq, gt, inArray, isNull, max, sql } from "drizzle-orm";
import { db, schema } from "./db";
import type { User } from "./db/schema";
import { similarTitles } from "./content-utils";
import { DIGEST_LOOKBACK_MS, planRequestDigest, sameNumbers } from "./course-request-rules";
import { notify } from "./notify";

const { courseRequests, courseRequestVotes, documents, docAuthors, notifications, subjects, users } = schema;

export type RequestView = {
  id: string; text: string; subjectId: number; subjectName: string; votes: number; voted: boolean; mine: boolean;
  // Jamais de nom : « Demandé par 3 étudiants » suffit, et personne ne sait qui attend quoi
  answer: { id: string; title: string } | null; removable: boolean; drafting: boolean; createdAt: Date; category: string | null;
};

export type RequestScope = { subjectId?: number; subjectIds?: number[]; status?: "open" | "answered" | "mine" | "all"; limit: number };

/** Les demandes ouvertes d'abord, les plus attendues en tête ; celles déjà résolues ensuite. Les doublons fusionnés n'apparaissent plus. */
export async function listRequests(user: Pick<User, "id" | "role" | "programId">, scope: RequestScope): Promise<RequestView[]> {
  if (scope.subjectIds && !scope.subjectIds.length) return [];
  const where = and(
    isNull(courseRequests.mergedInto),
    scope.subjectId !== undefined ? eq(courseRequests.subjectId, scope.subjectId) : undefined,
    scope.subjectIds ? inArray(courseRequests.subjectId, scope.subjectIds) : undefined,
    user.role === "admin" ? undefined : eq(subjects.programId, user.programId ?? -1),
    scope.status === "mine" ? eq(courseRequests.authorId, user.id) : undefined,
  );
  const rows = await db.select({
    id: courseRequests.id, text: courseRequests.text, subjectId: courseRequests.subjectId, subjectName: subjects.name, authorId: courseRequests.authorId, createdAt: courseRequests.createdAt, category: courseRequests.category,
    programId: subjects.programId,
    votes: sql<number>`(select count(*)::int from course_request_votes v where v.request_id = ${courseRequests.id})`,
    voted: sql<boolean>`exists (select 1 from course_request_votes v where v.request_id = ${courseRequests.id} and v.user_id = ${user.id})`,
  }).from(courseRequests).innerJoin(subjects, eq(courseRequests.subjectId, subjects.id)).where(where).orderBy(desc(courseRequests.createdAt)).limit(300);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const answers = await db.select({ id: documents.id, title: documents.title, requestId: documents.courseRequestId, subjectId: documents.subjectId }).from(documents)
    .where(and(inArray(documents.courseRequestId, ids), and(eq(documents.published, true), isNull(documents.deletedAt)), eq(documents.hiddenByReports, false)));
  const drafts = await db.select({ requestId: documents.courseRequestId }).from(documents).where(and(inArray(documents.courseRequestId, ids), eq(documents.createdBy, user.id), eq(documents.published, false), isNull(documents.deletedAt)));
  const moderator = (programId: number) => user.role === "admin" || (user.role === "delegate" && user.programId === programId);
  const views = rows.map((row): RequestView => {
    const answer = answers.find((a) => a.requestId === row.id && a.subjectId === row.subjectId);
    return {
      id: row.id, text: row.text, subjectId: row.subjectId, subjectName: row.subjectName, votes: row.votes, voted: row.voted, createdAt: row.createdAt, category: row.category,
      mine: row.authorId === user.id, answer: answer ? { id: answer.id, title: answer.title } : null,
      removable: row.authorId === user.id || moderator(row.programId), drafting: drafts.some((d) => d.requestId === row.id),
    };
  }).filter((v) => scope.status === "open" ? !v.answer : scope.status === "answered" ? Boolean(v.answer) : true);
  if (scope.status === "answered") views.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  else views.sort((a, b) => Number(Boolean(a.answer)) - Number(Boolean(b.answer)) || b.votes - a.votes || b.createdAt.getTime() - a.createdAt.getTime());
  return views.slice(0, scope.limit);
}

/** Les matières où la personne a déjà publié : elle pourrait y répondre. */
export async function subjectsAuthoredBy(userId: string) {
  const rows = await db.selectDistinct({ id: documents.subjectId }).from(documents)
    .where(and(eq(documents.createdBy, userId), eq(documents.published, true), isNull(documents.deletedAt)));
  return rows.flatMap((r) => (r.id ? [r.id] : []));
}

export type SimilarRequest = { id: string; text: string; votes: number; voted: boolean; subjectName: string };

/**
 * Une demande ouverte proche du texte, dans la licence : on propose « Moi aussi » plutôt qu'un doublon.
 * Trigrammes (pg_trgm) si l'extension est là, sinon la comparaison par mots du dépôt.
 */
export async function similarRequest(user: Pick<User, "id" | "role" | "programId">, text: string): Promise<SimilarRequest | null> {
  const scope = and(isNull(courseRequests.answeredAt), isNull(courseRequests.mergedInto), user.role === "admin" ? undefined : eq(subjects.programId, user.programId ?? -1));
  const fields = {
    id: courseRequests.id, text: courseRequests.text, subjectName: subjects.name,
    votes: sql<number>`(select count(*)::int from course_request_votes v where v.request_id = ${courseRequests.id})`,
    voted: sql<boolean>`exists (select 1 from course_request_votes v where v.request_id = ${courseRequests.id} and v.user_id = ${user.id})`,
  };
  try {
    const [row] = await db.select(fields).from(courseRequests).innerJoin(subjects, eq(courseRequests.subjectId, subjects.id))
      .where(and(scope, sql`similarity(lower(${courseRequests.text}), lower(${text})) >= 0.4`))
      .orderBy(sql`similarity(lower(${courseRequests.text}), lower(${text})) desc`).limit(1);
    return row ?? null;
  } catch {
    const rows = await db.select(fields).from(courseRequests).innerJoin(subjects, eq(courseRequests.subjectId, subjects.id)).where(scope).orderBy(desc(courseRequests.createdAt)).limit(200);
    return rows.find((r) => sameNumbers(r.text, text) && similarTitles(r.text, text)) ?? null;
  }
}

/** Les auteurs d'une matière sont prévenus au plus une fois par jour : voir planRequestDigest. */
export async function runRequestDigest(now = new Date()) {
  const open = await db.select({ id: courseRequests.id, subjectId: courseRequests.subjectId, subjectName: subjects.name, authorId: courseRequests.authorId, createdAt: courseRequests.createdAt })
    .from(courseRequests).innerJoin(subjects, eq(courseRequests.subjectId, subjects.id))
    .where(and(gt(courseRequests.createdAt, new Date(now.getTime() - DIGEST_LOOKBACK_MS)), isNull(courseRequests.answeredAt))).limit(500);
  if (!open.length) return;
  const subjectIds = [...new Set(open.map((r) => r.subjectId))];
  const published = and(inArray(documents.subjectId, subjectIds), and(eq(documents.published, true), isNull(documents.deletedAt)));
  const [owners, shared] = await Promise.all([
    db.selectDistinct({ userId: documents.createdBy, subjectId: documents.subjectId }).from(documents).innerJoin(users, eq(documents.createdBy, users.id)).where(and(published, eq(users.status, "active"))),
    db.selectDistinct({ userId: docAuthors.userId, subjectId: documents.subjectId }).from(docAuthors).innerJoin(documents, eq(docAuthors.documentId, documents.id)).innerJoin(users, eq(docAuthors.userId, users.id)).where(and(published, eq(users.status, "active"))),
  ]);
  const authors = new Map<number, string[]>();
  for (const { userId, subjectId } of [...owners, ...shared]) if (userId && subjectId) authors.set(subjectId, [...new Set([...(authors.get(subjectId) ?? []), userId])]);
  const people = [...new Set([...authors.values()].flat())];
  if (!people.length) return;
  const last = await db.select({ userId: notifications.userId, at: max(notifications.createdAt) }).from(notifications).where(and(eq(notifications.kind, "course_request"), inArray(notifications.userId, people))).groupBy(notifications.userId);
  const lastNotified = new Map(last.flatMap((row) => (row.at ? [[row.userId, row.at] as const] : [])));
  for (const plan of planRequestDigest(open, authors, lastNotified, now)) await notify(plan.userId, { kind: "course_request", title: plan.title, body: plan.body, href: plan.href });
}

/** Une seule fois par demande : le cours peut être retiré puis republié sans prévenir à nouveau. */
export async function announceAnswered(documentId: string) {
  const [doc] = await db.select({ title: documents.title, requestId: documents.courseRequestId, subjectId: documents.subjectId, createdBy: documents.createdBy }).from(documents).where(eq(documents.id, documentId));
  if (!doc?.requestId) return;
  const [request] = await db.update(courseRequests).set({ answeredAt: new Date() }).where(and(eq(courseRequests.id, doc.requestId), isNull(courseRequests.answeredAt), eq(courseRequests.subjectId, doc.subjectId ?? -1))).returning();
  if (!request) return;
  const voters = await db.select({ userId: courseRequestVotes.userId }).from(courseRequestVotes).where(eq(courseRequestVotes.requestId, request.id)).limit(300);
  const waiting = new Set([...(request.authorId ? [request.authorId] : []), ...voters.map((v) => v.userId)]);
  waiting.delete(doc.createdBy ?? "");
  for (const userId of waiting) await notify(userId, { kind: "new_course", title: "Le cours que tu attendais est en ligne", body: doc.title, href: `/d/${documentId}` });
}
