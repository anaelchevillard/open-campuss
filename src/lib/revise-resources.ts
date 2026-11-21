import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { readableDocuments } from "@/lib/access";
import { db, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { publicPacks } from "@/lib/memo-packs";

type Who = Pick<User, "id" | "role" | "programId" | "level">;

const { documents, memoPackCopies, subjects } = schema;

/**
 * Les paquets publics et les sujets de partiels ne sont pas des cours, ce sont des ressources de Réviser.
 * « Paquets de la promo » : les paquets publiés dans ma licence, sauf les miens, avec ce que j'ai déjà copié.
 */
export async function promoPacks(user: Who, limit = 60, query = "", documentId?: string) {
  const rows = (await publicPacks(user, query, documentId)).filter((row) => row.pack.ownerId !== user.id).slice(0, limit);
  const copied = rows.length
    ? new Set((await db.select({ id: memoPackCopies.packId }).from(memoPackCopies).where(and(eq(memoPackCopies.userId, user.id), inArray(memoPackCopies.packId, rows.map((r) => r.pack.id))))).map((r) => r.id))
    : new Set<string>();
  return rows.map((row) => ({ ...row, copied: copied.has(row.pack.id) }));
}

export type ExamPaper = { id: string; title: string; academicYear: string; subject: string; subjectId: number | null; quizReady: boolean };

/** « Sujets de partiels pour s'entraîner » : les partiels publiés des matières de ma licence et de mon année, les plus récents d'abord. */
export async function examPapersForMe(user: Who, limit = 60): Promise<ExamPaper[]> {
  if (!user.programId) return [];
  const rows = await db.select({
    id: documents.id, title: documents.title, academicYear: documents.academicYear, subject: sql<string>`coalesce(nullif(${subjects.shortName}, ''), ${subjects.name})`, subjectId: documents.subjectId,
    quizReady: sql<boolean>`${documents.quizStatus} = 'ready'`,
  }).from(documents).innerJoin(subjects, eq(documents.subjectId, subjects.id))
    .where(and(readableDocuments(user), isNull(documents.deletedAt), eq(documents.published, true), eq(documents.category, "partiel"),
      eq(subjects.programId, user.programId), eq(subjects.level, user.level ?? 1), isNull(subjects.archivedAt)))
    .orderBy(asc(subjects.position), desc(documents.academicYear), desc(documents.publishedAt)).limit(limit);
  return rows.map((r) => ({ ...r, subject: r.subject || "" }));
}
