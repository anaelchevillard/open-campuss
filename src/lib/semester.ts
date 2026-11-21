import "server-only";
import { and, asc, count, eq, gte, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { defaultTerms, parityOfSemester, pickParity, type Parity } from "@/lib/semester-rules";

export * from "@/lib/semester-rules";

/** Débuts de semestre d'une licence pour une année : sa ligne, sinon celle du site (licence vide), sinon le défaut. */
export async function termsOf(programId: number | null, academicYear: string) {
  const fallback = defaultTerms(new Date(`${academicYear.slice(0, 4)}-09-01T12:00:00`));
  const rows = await db.select().from(schema.academicTerms).where(and(eq(schema.academicTerms.academicYear, academicYear), programId ? or(eq(schema.academicTerms.programId, programId), isNull(schema.academicTerms.programId)) : isNull(schema.academicTerms.programId)));
  const pick = (parity: number) => (rows.find((r) => r.parity === parity && r.programId === programId) ?? rows.find((r) => r.parity === parity && r.programId === null))?.startsOn;
  return { academicYear, s1: pick(1) ?? fallback.s1, s2: pick(2) ?? fallback.s2 };
}

/** Semestre à montrer par défaut : celui du partiel le plus proche s'il tombe dans les 21 jours, sinon celui de la date. */
export async function currentParity(user: Pick<User, "programId" | "level">, now = new Date()): Promise<Parity> {
  const terms = await termsOf(user.programId, defaultTerms(now).academicYear);
  if (!user.programId) return pickParity(now, terms);
  const [exam] = await db.select({ at: schema.exams.at, semester: schema.subjects.semester }).from(schema.exams)
    .innerJoin(schema.subjects, eq(schema.exams.subjectId, schema.subjects.id))
    .where(and(eq(schema.subjects.programId, user.programId), eq(schema.subjects.level, user.level ?? 1), gte(schema.exams.at, now), isNotNull(schema.subjects.semester)))
    .orderBy(asc(schema.exams.at)).limit(1);
  return pickParity(now, terms, exam?.semester ? { at: exam.at, parity: parityOfSemester(exam.semester) } : null);
}

/** Matières d'un semestre : celles du semestre et les annuelles, sans les archivées. */
export async function subjectsForSemester(programId: number, level: number, parity: Parity) {
  const semester = 2 * level - 2 + parity;
  return db.select().from(schema.subjects)
    .where(and(eq(schema.subjects.programId, programId), eq(schema.subjects.level, level), isNull(schema.subjects.archivedAt), or(eq(schema.subjects.semester, semester), isNull(schema.subjects.semester))))
    .orderBy(asc(schema.subjects.position), asc(schema.subjects.name));
}

/** Pour classer une matière sans semestre : la parité la plus fréquente parmi les semestres déjà saisis sur ses documents. */
export async function suggestSemester(subjectId: number): Promise<Parity | null> {
  const rows = await db.select({ semester: schema.documents.semester, n: count() }).from(schema.documents)
    .where(and(eq(schema.documents.subjectId, subjectId), isNotNull(schema.documents.semester), isNull(schema.documents.deletedAt), inArray(schema.documents.semester, [1, 2, 3, 4, 5, 6])))
    .groupBy(schema.documents.semester);
  const tally = { 1: 0, 2: 0 };
  for (const row of rows) tally[parityOfSemester(row.semester!)] += row.n;
  if (!tally[1] && !tally[2]) return null;
  return tally[1] >= tally[2] ? 1 : 2;
}
