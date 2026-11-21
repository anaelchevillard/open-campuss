import "server-only";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { WANTED, type Wanted } from "@/lib/coverage-rules";
import { subjectsForSemester, type Parity } from "@/lib/semester";

export { WANTED, type Wanted };

/** Nombre de documents publiés par matière et par type. */
export async function countsBySubject(subjectIds: number[]) {
  if (!subjectIds.length) return [];
  return db.select({ subject: schema.documents.subjectId, category: schema.documents.category, n: count() }).from(schema.documents)
    .where(and(eq(schema.documents.published, true), isNull(schema.documents.deletedAt), inArray(schema.documents.subjectId, subjectIds)))
    .groupBy(schema.documents.subjectId, schema.documents.category);
}

/** Ce qui manque dans chaque matière d'un semestre : sert aux délégués, à l'accueil et à l'administration. */
export async function missingBySubject(programId: number, level: number, parity: Parity) {
  const subjects = await subjectsForSemester(programId, level, parity);
  const counts = await countsBySubject(subjects.map((s) => s.id));
  return subjects.map((subject) => {
    const byCategory = Object.fromEntries(WANTED.map((c) => [c, counts.find((r) => r.subject === subject.id && r.category === c)?.n ?? 0])) as Record<Wanted, number>;
    return { subject, counts: byCategory, missing: WANTED.filter((c) => !byCategory[c]) };
  });
}
