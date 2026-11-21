import "server-only";
import { and, count, eq, gt, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { categoryCountsLabel, isCategory, totalOf, type CategoryCounts } from "@/lib/category-counts";
import { db, schema } from "@/lib/db";

const { users, documents, reports, outbox } = schema;
const DAY = 86_400_000;

/** Ce qui attend l'administration : chaque compteur, filtré par licence quand elle est choisie. */
export async function adminQueue(programId: number | null) {
  const inProgram = (col: AnyPgColumn) => (programId ? eq(col, programId) : undefined);
  const [[pending], [toValidate], [openReports], [profiles], [cards], [stale], [failedMails], [unfiled], [syncErrors], [withdrawals]] = await Promise.all([
    db.select({ n: count() }).from(users).where(and(eq(users.status, "pending"), inProgram(users.programId))),
    db.select({ n: count() }).from(documents).where(and(eq(documents.reviewRequested, true), isNull(documents.deletedAt), inProgram(documents.programId))),
    db.select({ n: count() }).from(reports).where(eq(reports.status, "open")),
    db.select({ n: count() }).from(schema.profileReports).where(eq(schema.profileReports.status, "open")),
    db.select({ n: count() }).from(schema.memoCardReports).where(eq(schema.memoCardReports.status, "open")),
    db.select({ n: count() }).from(schema.courseRequests).innerJoin(schema.subjects, eq(schema.courseRequests.subjectId, schema.subjects.id))
      .where(and(isNull(schema.courseRequests.answeredAt), isNull(schema.courseRequests.mergedInto), lt(schema.courseRequests.createdAt, new Date(Date.now() - 14 * DAY)), programId ? eq(schema.subjects.programId, programId) : undefined)),
    db.select({ n: count() }).from(outbox).where(gt(outbox.attempts, 0)),
    db.select({ n: count() }).from(documents).where(and(isNull(documents.subjectId), isNull(documents.deletedAt), inProgram(documents.programId))),
    db.select({ n: count() }).from(documents).where(and(isNotNull(documents.syncError), isNull(documents.deletedAt))),
    db.select({ n: count() }).from(schema.withdrawalRequests).innerJoin(documents, eq(schema.withdrawalRequests.documentId, documents.id)).where(and(eq(schema.withdrawalRequests.status, "pending"), inProgram(documents.programId))),
  ]);
  return { pending: pending.n, toValidate: toValidate.n, openReports: openReports.n, profiles: profiles.n, cards: cards.n, staleRequests: stale.n, failedMails: failedMails.n, unfiled: unfiled.n, syncErrors: syncErrors.n, withdrawals: withdrawals.n };
}

/** Série quotidienne sur 14 jours (mini-courbe du pouls). */
export async function dailySeries(kind: "signups" | "published" | "views" | "logins", days = 14) {
  const since = new Date(Date.now() - (days - 1) * DAY);
  since.setHours(0, 0, 0, 0);
  const query = kind === "signups" ? sql`select date_trunc('day', created_at) d, count(*)::int n from users where created_at >= ${since} group by 1`
    : kind === "published" ? sql`select date_trunc('day', published_at) d, count(*)::int n from documents where published_at >= ${since} and deleted_at is null group by 1`
      : kind === "views" ? sql`select date_trunc('day', at) d, count(*)::int n from page_views where at >= ${since} group by 1`
        : sql`select date_trunc('day', last_login_at) d, count(*)::int n from users where last_login_at >= ${since} group by 1`;
  const rows = (await db.execute(query)).rows as { d: Date | string; n: number }[];
  const byDay = new Map(rows.map((r) => [new Date(r.d).toDateString(), Number(r.n)]));
  return Array.from({ length: days }, (_, i) => byDay.get(new Date(since.getTime() + i * DAY).toDateString()) ?? 0);
}

/** Couverture : publications par matière et semestre d'une licence, par type. */
export async function coverageBySemester(programId: number | null) {
  const rows = await db.select({ id: schema.subjects.id, subject: schema.subjects.name, level: schema.subjects.level, semester: schema.subjects.semester, category: documents.category, n: count(documents.id) })
    .from(schema.subjects).leftJoin(documents, and(eq(documents.subjectId, schema.subjects.id), eq(documents.published, true), isNull(documents.deletedAt)))
    .where(and(isNull(schema.subjects.archivedAt), programId ? eq(schema.subjects.programId, programId) : undefined))
    .groupBy(schema.subjects.id, documents.category).orderBy(schema.subjects.level, schema.subjects.semester, schema.subjects.position);
  const out = new Map<number, { subject: string; level: number; semester: number | null; counts: CategoryCounts }>();
  for (const row of rows) {
    const entry = out.get(row.id) ?? { subject: row.subject, level: row.level, semester: row.semester, counts: {} };
    const counts = isCategory(row.category) ? { ...entry.counts, [row.category]: (entry.counts[row.category] ?? 0) + row.n } : entry.counts;
    out.set(row.id, { ...entry, counts });
  }
  return [...out.values()].map((c) => ({ ...c, n: totalOf(c.counts), label: categoryCountsLabel(c.counts) }));
}
