import "server-only";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { statusOf } from "@/components/status-badge";
import { db, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { cardStats } from "@/lib/doc-stats";
import { lastSendBacks } from "@/lib/document-reviews";
import type { MyDoc } from "@/lib/my-documents";
import { weeklyReaders } from "@/lib/reminders/readers";
import { TRASH_DAYS } from "@/lib/trash";

const { documents, subjects } = schema;

/** Tous les documents de l'auteur, corbeille comprise, avec ce qu'affichent la grille et la liste, en trois requêtes. */
export async function loadMyDocuments(user: Pick<User, "id" | "role">): Promise<MyDoc[]> {
  const rows = await db.select({
    doc: documents, subject: subjects.shortName, subjectName: subjects.name, ...cardStats,
    openQuestions: sql<number>`(select count(*)::int from qa_posts q where q.document_id = "documents"."id" and q.parent_id is null and not q.hidden and not exists (select 1 from qa_posts r where r.parent_id = q.id and not r.hidden))`,
    pendingRevision: sql<boolean>`exists (select 1 from revisions v where v.document_id = "documents"."id" and v.status = 'pending')`,
    bodyLength: sql<number>`length(coalesce("documents"."body_text", ''))`,
  }).from(documents).leftJoin(subjects, eq(documents.subjectId, subjects.id))
    // Les siens, et ceux dont la personne est co-autrice (hors corbeille : seul l'auteur principal la voit)
    .where(and(or(eq(documents.createdBy, user.id), and(isNull(documents.deletedAt), sql`exists (select 1 from doc_authors a where a.document_id = "documents"."id" and a.user_id = ${user.id})`)), user.role === "admin" ? undefined : eq(documents.kind, "editor")))
    .orderBy(desc(documents.updatedAt)).limit(500);
  const [weekly, sendBacks] = await Promise.all([weeklyReaders(user.id), lastSendBacks(rows.filter((r) => r.doc.reviewNote).map((r) => r.doc.id))]);
  const now = Date.now();
  return rows.map(({ doc, subject, subjectName, ratingAvg, ratingCount, readers, openQuestions, pendingRevision, bodyLength }) => {
    const back = sendBacks.get(doc.id);
    return {
      id: doc.id, title: doc.title, category: doc.category, kind: doc.kind, subjectId: doc.subjectId, subject: subject || subjectName || null, chapter: doc.chapter, semester: doc.semester,
      academicYear: doc.academicYear, coverFileId: doc.coverFileId, teacherName: doc.teacherName, rightsBasis: doc.rightsBasis, bodyLength,
      status: statusOf(doc, pendingRevision), published: doc.published, updatedAt: doc.updatedAt.toISOString(), deletedAt: doc.deletedAt?.toISOString() ?? null,
      trashDaysLeft: doc.deletedAt ? Math.max(0, TRASH_DAYS - Math.floor((now - doc.deletedAt.getTime()) / 86_400_000)) : null,
      readers, readersWeek: weekly.perDoc.get(doc.id) ?? 0, ratingAvg, ratingCount, openQuestions,
      reviewNote: doc.reviewNote, reviewer: back?.reviewer ?? null, reasonCode: back?.reasonCode ?? null,
      waitingSince: doc.reviewRequested ? (doc.reviewRequestedAt ?? doc.updatedAt).toISOString() : null,
    };
  });
}
