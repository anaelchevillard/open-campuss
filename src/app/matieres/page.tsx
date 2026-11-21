import Link from "next/link";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DocCard, DocGrid } from "@/components/doc-card";
import { DocFilters } from "@/components/doc-filters";
import { EmptyState } from "@/components/empty-state";
import { YearMenu } from "@/components/home/year-menu";
import { PageHeader } from "@/components/page-header";
import { SectionSwitch } from "@/components/requests/section-switch";
import { SearchField } from "@/components/search/search-field";
import { SemesterSwitch } from "@/components/semester-switch";
import { Shell } from "@/components/shell";
import { buttonVariants } from "@/components/ui/button";
import { readableDocuments } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { DOC_SORTS, docCardFields, docSortOf, sortDocs, viewedProgram, viewedTerm } from "@/lib/catalog";
import { escapeLike, folded } from "@/lib/content-utils";
import { db, schema } from "@/lib/db";
import { CATEGORY_TAGS } from "@/lib/db/categories";
import { cardStats } from "@/lib/doc-stats";
import { categoryCountsLabel, countByCategory, countsByKey, totalOf } from "@/lib/category-counts";
import { IconFavorite, IconSearch, IconSubjects } from "@/lib/icons";
import { SEARCH_TYPES, searchType } from "@/lib/search-rules";
import { SearchMiss } from "@/components/tracker";
import { subjectsForSemester } from "@/lib/semester";

export const metadata = { title: "Matières" };

const { documents, favorites: favoritesTable, subjects: subjectsTable } = schema;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Matières du semestre ; dès qu'une recherche ou un filtre est actif, les cours de toutes les matières, groupés par matière. */
export default async function SubjectsPage({ searchParams }: PageProps<"/matieres">) {
  const user = await requireUser();
  if (user.role === "teacher") redirect("/enseignant");
  const params = await searchParams;
  const q = one(params.q).trim().slice(0, 200);
  const favorites = one(params.favoris) === "1";
  const type = searchType(one(params.type));
  const sort = docSortOf(one(params.tri));
  const sorted = one(params.tri) !== "";
  const { level, parity, current } = await viewedTerm(user, params.semestre);
  // Un administrateur sans licence voit la même licence qu'à l'accueil (avant : aucune matière)
  const program = await viewedProgram(user, one(params.licence));
  const programId = program?.id ?? -1;
  const subjects = program ? await subjectsForSemester(programId, level, parity) : [];
  const ids = subjects.map((s) => s.id);
  const listing = Boolean(q || favorites || type || sorted);

  // Compté par type (« 3 CM · 1 fiche »), jamais « n cours » pour une fiche ou un partiel
  const counts = countsByKey(ids.length && !listing ? (await db.select({ subject: documents.subjectId, category: documents.category, n: sql<number>`count(*)::int` }).from(documents)
    .where(and(readableDocuments(user), inArray(documents.subjectId, ids))).groupBy(documents.subjectId, documents.category)).map((r) => ({ key: r.subject, category: r.category, n: r.n })) : []);
  const favIds = (await db.select({ id: favoritesTable.documentId }).from(favoritesTable).where(eq(favoritesTable.userId, user.id))).map((f) => f.id);
  const favSet = new Set(favIds);
  const needle = folded(q);
  const scope = favorites
    ? (favIds.length ? inArray(documents.id, favIds) : sql`false`)
    : q
      ? and(user.role === "admin" ? undefined : eq(documents.programId, programId), or(sql`${documents.searchVector} @@ websearch_to_tsquery('french', ${needle})`, sql`${documents.searchText} ilike ${`%${escapeLike(needle)}%`} escape '\\'`))
      : ids.length ? inArray(documents.subjectId, ids) : sql`false`;
  const rows = listing
    ? sortDocs(await db.select({ ...docCardFields, ...cardStats, subject: subjectsTable.name, subjectShort: subjectsTable.shortName, subjectPosition: subjectsTable.position }).from(documents)
      .leftJoin(subjectsTable, eq(documents.subjectId, subjectsTable.id))
      .where(and(readableDocuments(user), isNull(documents.deletedAt), scope, type ? eq(documents.category, type) : undefined))
      .orderBy(desc(documents.updatedAt)).limit(120), sort)
    : [];
  // Groupes par matière : celles du semestre dans leur ordre, puis les autres
  const groups = new Map<string, typeof rows>();
  const order = (subjectId: number | null) => { const i = ids.indexOf(subjectId ?? -1); return i < 0 ? 999 : i; };
  for (const row of [...rows].sort((a, b) => order(a.subjectId) - order(b.subjectId))) {
    const key = row.subject ?? "Sans matière";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const typeOptions = SEARCH_TYPES.map((c) => ({ value: c, label: CATEGORY_TAGS[c] }));
  const empty = listing && !rows.length;

  return (
    <Shell user={user}>
      <SectionSwitch value="matieres" role={user.role} />
      <PageHeader title="Matières"
        action={program ? <><YearMenu level={level} /><SemesterSwitch level={level} value={parity} current={current} /></> : undefined} />
      <div className="mb-6 grid gap-3">
        <Suspense><SearchField /></Suspense>
        <Suspense><DocFilters types={typeOptions} favorites sort={listing ? { name: "tri", label: "Trier", all: DOC_SORTS[""], options: Object.entries(DOC_SORTS).filter(([k]) => k).map(([value, label]) => ({ value, label })) } : undefined} /></Suspense>
      </div>
      <div key={`${listing}-${parity}-${level}`} className="animate-[fade_150ms_ease-out]">
        {listing ? (
          empty ? (
            q
              ? <><SearchMiss query={q} /><EmptyState icon={IconSearch} title={`Aucun résultat pour « ${q} »`} action={<Link href={`/demandes?nouvelle=1&texte=${encodeURIComponent(q)}`} data-slot="button" className={buttonVariants({ variant: "outline" })}>Demander ce cours</Link>} /></>
              : favorites
                ? <EmptyState icon={IconFavorite} title="Aucun favori ici" action={<Link href="/matieres" data-slot="button" className={buttonVariants({ variant: "outline" })}>Retirer le filtre</Link>} />
                : <EmptyState icon={IconSubjects} title="Aucun cours avec ce filtre" action={<Link href="/matieres" data-slot="button" className={buttonVariants({ variant: "outline" })}>Retirer le filtre</Link>} />
          ) : (
            <div className="grid gap-8">
              {[...groups].map(([name, docs]) => (
                <section key={name} aria-label={name} className="grid gap-3">
                  <h2 className="heading flex items-baseline gap-2">{name}<span className="text-sm font-normal text-muted-foreground tabular-nums">{categoryCountsLabel(countByCategory(docs))}</span></h2>
                  <DocGrid>{docs.map((d) => <li key={d.id}><DocCard doc={d} favorite={favSet.has(d.id)} /></li>)}</DocGrid>
                </section>
              ))}
            </div>
          )
        ) : subjects.length ? (
          <div className="@container">
            <ul className="stagger grid gap-3 @[30rem]:grid-cols-2 @[52rem]:grid-cols-3">
              {subjects.map((s) => {
                const mine = counts.get(s.id) ?? {};
                const n = totalOf(mine);
                return (
                  <li key={s.id}>
                    <Link href={`/matieres/${s.id}`} className={`group flex h-full flex-col gap-1 rounded-xl bg-card p-4 shadow-xs transition-[box-shadow,translate,scale] duration-(--dur-base) ease-out hover-ok:shadow-sm motion-ok:hover-ok:-translate-y-0.5 motion-ok:active:scale-[.985] ${n ? "" : "opacity-70"}`}>
                      <span className="card-title font-semibold text-balance">{s.name}</span>
                      <span className="text-sm text-muted-foreground tabular-nums">{categoryCountsLabel(mine)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : <EmptyState icon={IconSubjects} title="Aucune matière ce semestre" />}
      </div>
    </Shell>
  );
}
