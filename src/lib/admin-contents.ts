import "server-only";
import { and, asc, count, desc, eq, exists, ilike, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { db, schema } from "./db";

const { documents, users, subjects, programs } = schema;
export const CONTENT_PAGE = 50;

const list = (v?: string) => (v ? v.split(",").filter(Boolean) : []);
const nums = (v?: string) => list(v).map(Number).filter((n) => Number.isInteger(n) && n > 0);

function stateWhere(states: string[]): SQL | undefined {
  const parts = states.map((s) => ({
    draft: and(eq(documents.published, false), eq(documents.reviewRequested, false), isNull(documents.reviewNote)),
    tofix: and(eq(documents.published, false), eq(documents.reviewRequested, false), isNotNull(documents.reviewNote)),
    pending: eq(documents.reviewRequested, true),
    published: and(eq(documents.published, true), eq(documents.hiddenByReports, false)),
    hidden: eq(documents.hiddenByReports, true),
  } as Record<string, SQL | undefined>)[s]).filter(Boolean) as SQL[];
  return parts.length ? sql`(${sql.join(parts, sql` or `)})` : undefined;
}

/** Contenus de la grille : filtres, tri, pagination côté serveur ; onglet Corbeille à part. */
export async function listContents(p: Record<string, string | undefined>, programId: number | null) {
  const trash = p.onglet === "corbeille";
  const like = p.q ? `%${p.q.trim().slice(0, 80).replace(/[%_\\]/g, "\\$&")}%` : null;
  const progs = nums(p.licence).length ? nums(p.licence) : programId ? [programId] : [];
  const where = and(
    trash ? isNotNull(documents.deletedAt) : isNull(documents.deletedAt),
    like ? sql`(${ilike(documents.title, like)} or ${ilike(users.name, like)} or ${ilike(users.email, like)})` : undefined,
    progs.length ? inArray(documents.programId, progs) : undefined,
    nums(p.matiere).length ? inArray(documents.subjectId, nums(p.matiere)) : undefined,
    nums(p.semestre).length ? inArray(documents.semester, nums(p.semestre)) : undefined,
    list(p.type).length ? inArray(documents.category, list(p.type) as never[]) : undefined,
    stateWhere(list(p.etat)),
    p.sans_matiere === "oui" ? isNull(documents.subjectId) : undefined,
    p.signale === "oui" ? exists(db.select({ x: sql`1` }).from(schema.reports).where(and(eq(schema.reports.documentId, documents.id), eq(schema.reports.status, "open")))) : undefined,
    p.synchro === "erreur" ? isNotNull(documents.syncError) : undefined,
  );
  const sorts: Record<string, SQL> = { titre: sql`${documents.title}`, maj: sql`${documents.updatedAt}`, vues: sql`views`, notes: sql`rating nulls last` };
  const col = sorts[p.tri ?? ""];
  const order = col ? (p.sens === "asc" ? asc(col) : desc(col)) : desc(trash ? documents.deletedAt : documents.updatedAt);
  const page = Math.max(1, Number(p.page) || 1);
  const base = db.select({
    id: documents.id, title: documents.title, category: documents.category, published: documents.published, reviewRequested: documents.reviewRequested, reviewNote: documents.reviewNote,
    postReviewAt: documents.postReviewAt, hiddenByReports: documents.hiddenByReports, deletedAt: documents.deletedAt, semester: documents.semester, updatedAt: documents.updatedAt, syncError: documents.syncError,
    author: users.name, authorId: users.id, program: programs.name, subject: subjects.name, subjectId: documents.subjectId,
    subjectShort: subjects.shortName, level: subjects.level, chapter: documents.chapter, academicYear: documents.academicYear, coverFileId: documents.coverFileId,
    views: sql<number>`(select count(*)::int from reading_progress r where r.document_id = ${documents.id})`.as("views"),
    rating: sql<number | null>`(select round(avg(stars)::numeric, 1)::float from document_ratings g where g.document_id = ${documents.id})`.as("rating"),
  }).from(documents).leftJoin(users, eq(documents.createdBy, users.id)).leftJoin(programs, eq(documents.programId, programs.id)).leftJoin(subjects, eq(documents.subjectId, subjects.id));
  const [rows, [{ n }], [{ n: trashed }]] = await Promise.all([
    base.where(where).orderBy(order).limit(CONTENT_PAGE).offset((page - 1) * CONTENT_PAGE),
    db.select({ n: count() }).from(documents).leftJoin(users, eq(documents.createdBy, users.id)).where(where),
    db.select({ n: count() }).from(documents).where(isNotNull(documents.deletedAt)),
  ]);
  return { rows, total: n, page, trash, trashed };
}
export type ContentRow = Awaited<ReturnType<typeof listContents>>["rows"][number];
