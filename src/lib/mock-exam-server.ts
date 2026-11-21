import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { readableDocuments } from "@/lib/access";
import { db, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import type { QuizSource } from "@/lib/mock-exam";

type Who = Pick<User, "id" | "role" | "programId" | "level">;

const { documents, flashcards, quizzes } = schema;

/** Les quiz prêts des cours d'une matière, lisibles par la personne (ce que tire mockExamQuestions). */
export async function quizSources(user: Who, subjectId: number): Promise<QuizSource[]> {
  return db.select({ docId: documents.id, questions: sql<number>`jsonb_array_length(${quizzes.questions})::int` }).from(quizzes)
    .innerJoin(documents, eq(quizzes.documentId, documents.id))
    .where(and(readableDocuments(user), isNull(documents.deletedAt), eq(documents.subjectId, subjectId), eq(documents.quizStatus, "ready")))
    .orderBy(desc(documents.publishedAt)).limit(6);
}

/** Nombre de questions de quiz par matière, pour proposer une autre matière prête. */
export async function quizQuestionsBySubject(user: Who, subjectIds: number[]) {
  if (!subjectIds.length) return new Map<number, number>();
  const rows = await db.select({ subjectId: documents.subjectId, questions: sql<number>`sum(jsonb_array_length(${quizzes.questions}))::int` }).from(quizzes)
    .innerJoin(documents, eq(quizzes.documentId, documents.id))
    .where(and(readableDocuments(user), isNull(documents.deletedAt), inArray(documents.subjectId, subjectIds), eq(documents.quizStatus, "ready")))
    .groupBy(documents.subjectId);
  return new Map(rows.map((r) => [r.subjectId!, Number(r.questions)]));
}

/** Les cours publiés d'une matière sans quiz prêt : ceux que Campuss IA peut préparer. */
export function coursesWithoutQuiz(user: Who, subjectId: number, limit = 8) {
  return db.select({ id: documents.id, title: documents.title, quizStatus: documents.quizStatus }).from(documents)
    .where(and(readableDocuments(user), isNull(documents.deletedAt), eq(documents.published, true), eq(documents.subjectId, subjectId),
      inArray(documents.category, ["cours", "td", "fiche"]), inArray(documents.quizStatus, ["none", "failed", "pending"])))
    .orderBy(asc(documents.chapter), desc(documents.publishedAt)).limit(limit);
}

/** Les sujets de partiels publiés d'une matière (ressource pour s'entraîner). */
export function examPapers(user: Who, subjectId: number, limit = 3) {
  return db.select({ id: documents.id, title: documents.title, academicYear: documents.academicYear, quizReady: sql<boolean>`${documents.quizStatus} = 'ready'` }).from(documents)
    .where(and(readableDocuments(user), isNull(documents.deletedAt), eq(documents.published, true), eq(documents.subjectId, subjectId), eq(documents.category, "partiel")))
    .orderBy(desc(documents.academicYear), desc(documents.publishedAt)).limit(limit);
}

/** Mes fiches rattachées aux cours d'une matière (pas de côté, assez courtes pour un QCM). */
export function myCardsInSubject(userId: string, subjectId: number, limit = 200) {
  return db.select({ id: flashcards.id, front: flashcards.front, back: flashcards.back }).from(flashcards)
    .innerJoin(documents, eq(flashcards.documentId, documents.id))
    .where(and(eq(flashcards.userId, userId), eq(documents.subjectId, subjectId), isNull(flashcards.suspendedAt), sql`length(${flashcards.back}) <= 400`))
    .orderBy(desc(flashcards.lastReviewedAt)).limit(limit);
}
