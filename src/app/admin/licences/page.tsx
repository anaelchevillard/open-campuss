import { and, asc, count, eq, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { Suspense } from "react";
import { semesterConflicts } from "@/app/actions/admin/structure";
import { AdminHeader, adminProgram } from "@/components/admin/admin-header";
import { LicencesBoard } from "@/components/admin/licences-board";
import { Shell } from "@/components/shell";
import { requireAdmin } from "@/lib/auth";
import { listPrograms } from "@/lib/catalog";
import { categoryCountsLabel, countsByKey, totalOf } from "@/lib/category-counts";
import { db, schema } from "@/lib/db";
import { academicYearOf, suggestSemester, termsOf } from "@/lib/semester";

export const metadata: Metadata = { title: "Licences et matières" };

export default async function LicencesPage({ searchParams }: PageProps<"/admin/licences">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const programs = await listPrograms();
  const chosen = Number(sp.licence) || (await adminProgram()) || programs[0]?.id || null;
  const program = programs.find((p) => p.id === chosen) ?? programs[0];
  const level = [1, 2, 3].includes(Number(sp.annee)) ? Number(sp.annee) : 1;
  const year = academicYearOf(new Date());
  const subjects = program ? await db.select().from(schema.subjects).where(and(eq(schema.subjects.programId, program.id), eq(schema.subjects.level, level))).orderBy(asc(schema.subjects.position), asc(schema.subjects.id)) : [];
  // Par type (« 3 CM · 1 fiche »)
  const counts = countsByKey(program ? (await db.select({ id: schema.documents.subjectId, category: schema.documents.category, n: count() }).from(schema.documents).where(and(eq(schema.documents.programId, program.id), isNull(schema.documents.deletedAt))).groupBy(schema.documents.subjectId, schema.documents.category)).map((r) => ({ key: r.id, category: r.category, n: r.n })) : []);
  const suggestions = Object.fromEntries(await Promise.all(subjects.filter((s) => s.semester === null && !s.archivedAt).map(async (s) => [s.id, await suggestSemester(s.id)] as const)));
  const [terms, conflicts, customTerms] = program ? await Promise.all([
    termsOf(program.id, year), semesterConflicts(program.id),
    db.select().from(schema.academicTerms).where(and(eq(schema.academicTerms.programId, program.id), eq(schema.academicTerms.academicYear, year))),
  ]) : [null, [], []];
  return (
    <Shell user={admin} width="wide">
      <AdminHeader title="Licences et matières" section="contenus" current="/admin/licences" program={false} />
      <Suspense>
        <LicencesBoard
          programs={programs.map((p) => ({ id: p.id, name: p.name, active: p.active }))} programId={program?.id ?? null} level={level} year={year}
          terms={terms ? { s1: terms.s1, s2: terms.s2, custom: customTerms.length > 0 } : null}
          subjects={subjects.map((s) => ({ id: s.id, name: s.name, shortName: s.shortName, semester: s.semester, archived: Boolean(s.archivedAt), docs: totalOf(counts.get(s.id) ?? {}), docsLabel: categoryCountsLabel(counts.get(s.id) ?? {}, { empty: "Aucun document" }), suggested: suggestions[s.id] ?? null }))}
          conflicts={conflicts.map((c) => ({ id: c.id, title: c.title, semester: c.semester, subject: c.subject, subjectSemester: c.subjectSemester }))}
        />
      </Suspense>
    </Shell>
  );
}
