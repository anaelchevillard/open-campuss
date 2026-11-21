import { and, asc, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { joinNotes } from "@/app/actions/notes";
import { Breadcrumb } from "@/components/breadcrumb";
import { DocCard, DocGrid } from "@/components/doc-card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RequestList } from "@/components/requests/request-card";
import { RequestComposer } from "@/components/requests/request-composer";
import { Shell } from "@/components/shell";
import { Submit } from "@/components/submit";
import { buttonVariants } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemTitle } from "@/components/ui/item";
import { readableDocuments } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { followsSubject } from "@/lib/people";
import { DOC_SORTS, docCardFields, sortDocs, type DocSort } from "@/lib/catalog";
import { listRequests } from "@/lib/course-requests";
import { db, schema } from "@/lib/db";
import { CATEGORY_PLURALS, CATEGORY_TAGS } from "@/lib/db/categories";
import { CATEGORY_ORDER, countByCategory, defaultCategory, selectedCategory } from "@/lib/category-counts";
import { cardStats } from "@/lib/doc-stats";
import { sameTeacher, teacherOptions, yearLabel, yearOptions } from "@/lib/doc-facets";
import { notesInProgress } from "@/lib/notes";
import { IconSubjects } from "@/lib/icons";
import { SubjectActions, SubjectFilters } from "./subject-actions";

export const metadata: Metadata = { title: "Matière" };

const { documents, favorites, subjects, programs } = schema;
// La matière garde son tri historique par chapitre ; « Récents » et les autres viennent du catalogue
const SORTS = { "": "Par chapitre", recent: "Récents", lus: DOC_SORTS.lus, notes: DOC_SORTS.notes, az: DOC_SORTS.az } as const;

export default async function SubjectPage({ params, searchParams }: PageProps<"/matieres/[id]">) {
  const query = await searchParams;
  const pick = (name: string) => (typeof query[name] === "string" ? query[name] as string : "");
  const sort = (pick("tri") in SORTS ? pick("tri") : "") as keyof typeof SORTS;
  const chapter = /^\d{1,3}$/.test(pick("chapitre")) ? Number(pick("chapitre")) : null;
  const semester = /^[1-6]$/.test(pick("semestre")) ? Number(pick("semestre")) : null;
  const teacher = pick("enseignant") || null;
  const year = pick("annee") || null;
  const favoritesOnly = pick("favoris") === "1";
  const user = await requireUser();
  const { id: raw } = await params;
  if (!/^\d{1,9}$/.test(raw)) notFound();
  const [row] = await db.select({ subject: subjects, program: programs }).from(subjects).innerJoin(programs, eq(subjects.programId, programs.id)).where(eq(subjects.id, Number(raw)));
  // Une matière d'une autre licence n'existe pas pour ce compte
  if (!row || (user.role !== "admin" && row.subject.programId !== user.programId)) notFound();
  const { subject } = row;
  // Des cartes, pas des cours : ni le texte ni les blocs ne remontent de la base
  const [all, requests, notes, favoriteRows] = await Promise.all([
    db.select({ ...docCardFields, ...cardStats }).from(documents).where(and(readableDocuments(user), eq(documents.subjectId, subject.id)))
      .orderBy(...(sort === "" ? [asc(documents.chapter), desc(documents.academicYear), desc(documents.updatedAt)] : [desc(documents.updatedAt)])),
    listRequests(user, { subjectId: subject.id, status: "open", limit: 3 }),
    notesInProgress(user, subject.id),
    db.select({ id: favorites.documentId }).from(favorites).where(eq(favorites.userId, user.id)),
  ]);
  const favSet = new Set(favoriteRows.map((f) => f.id));
  // Plus de vue « tout ce qui est publié ». Un type est toujours choisi : celui de l'adresse s'il existe ici,
  // sinon les CM, sinon le premier type présent. Une ancienne adresse sans type ouvre donc les CM.
  const counts = countByCategory(all);
  const only = selectedCategory(pick("type"), counts);
  const fallback = defaultCategory(counts);
  const filtered = all.filter((d) => (!only || d.category === only) && (chapter === null || d.chapter === chapter) && (semester === null || d.semester === semester)
    && (!teacher || sameTeacher(d.teacherName, teacher)) && (!year || d.academicYear === year) && (!favoritesOnly || favSet.has(d.id)));
  const rows = sort === "" || sort === "recent" ? filtered : sortDocs(filtered, sort as DocSort);
  const chapters = [...new Set(all.map((d) => d.chapter).filter((n): n is number => n !== null))].sort((a, b) => a - b);
  const semesters = subject.semester ? [] : [...new Set(all.map((d) => d.semester).filter((n): n is number => n !== null))].sort((a, b) => a - b);
  const typeLabel = (c: keyof typeof CATEGORY_PLURALS) => (c === "cours" ? CATEGORY_TAGS[c] : CATEGORY_PLURALS[c]);
  const types = CATEGORY_ORDER.filter((c) => counts[c]).map((c) => ({ value: c, label: typeLabel(c), count: counts[c] }));
  const keepType = only && only !== fallback ? `?type=${only}` : "";
  const menus = [
    { name: "chapitre", label: "Filtrer par chapitre", all: "Chapitres", options: chapters.map((n) => ({ value: String(n), label: `Chapitre ${n}` })) },
    { name: "semestre", label: "Filtrer par semestre", all: "Semestres", options: semesters.map((n) => ({ value: String(n), label: `S${n}` })) },
    { name: "enseignant", label: "Filtrer par enseignant", all: "Enseignants", options: teacherOptions(all).map((name) => ({ value: name, label: name })) },
    { name: "annee", label: "Filtrer par année universitaire", all: "Années", options: yearOptions(all).map((y) => ({ value: y, label: yearLabel(y) })) },
  ];
  const sortMenu = { name: "tri", label: "Trier", all: SORTS[""], options: Object.entries(SORTS).filter(([k]) => k).map(([value, label]) => ({ value, label })) };
  const term = subject.semester ? `S${subject.semester}` : `L${subject.level} · annuelle`;

  return (
    <Shell user={user}>
      <Breadcrumb items={[{ label: "Matières", href: "/matieres" }, { label: subject.name }]} />
      <PageHeader title={subject.name} shortTitle={subject.shortName || subject.name} lead={term} action={<SubjectActions subjectId={subject.id} following={await followsSubject(user.id, subject.id)} />} />
      <section id="demandes" aria-label="Demandes de cours" className="mb-8 grid max-w-3xl scroll-mt-20 gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="heading">Demandes</h2>
          <Link href={`/demandes?matiere=${subject.id}`} className="text-sm font-semibold text-link hover:underline">Voir tout</Link>
        </div>
        <RequestList requests={requests} showSubject={false} label="Demandes ouvertes" />
        <RequestComposer subjects={[{ id: subject.id, name: subject.name, shortName: subject.shortName }]} subjectId={subject.id} quiet />
      </section>
      {notes.length > 0 && (
        <section aria-label="Notes en cours" className="mb-8 grid max-w-3xl gap-2">
          {notes.map((n) => (
            <Item key={n.id} variant="outline" className="bg-card">
              <ItemContent><ItemTitle>{n.title || "Notes en cours"}</ItemTitle></ItemContent>
              <ItemActions><form action={joinNotes}><input type="hidden" name="id" value={n.id} /><Submit size="sm" variant="outline">{n.member ? "Reprendre" : "Rejoindre"}</Submit></form></ItemActions>
            </Item>
          ))}
        </section>
      )}
      {all.length ? (
        <section aria-label="Cours de la matière" className="grid gap-4">
          <Suspense><SubjectFilters types={types} selected={only} fallback={fallback} menus={menus} sort={sortMenu} hints={user.prefs.hints} /></Suspense>
          {only === "partiel" && <p className="text-sm text-muted-foreground">Pour t’entraîner sur ces sujets : <Link href="/reviser/partiels#sujets" className="font-semibold text-link hover:underline">Réviser › Partiels</Link></p>}
          {rows.length
            ? <DocGrid key={JSON.stringify(query)}>{rows.map((d) => <li key={d.id}><DocCard doc={{ ...d, subjectShort: subject.shortName || subject.name }} favorite={favSet.has(d.id)} /></li>)}</DocGrid>
            : <EmptyState icon={IconSubjects} title={favoritesOnly ? "Aucun favori ici" : `Rien dans « ${only ? typeLabel(only) : "CM"} » avec ces filtres`} action={<Link href={`/matieres/${subject.id}${keepType}`} data-slot="button" className={buttonVariants({ variant: "outline" })}>Retirer les filtres</Link>} />}
        </section>
      ) : (
        <EmptyState icon={IconSubjects} title="Rien de publié pour l’instant" description="Le premier cours partagé ici rapporte des crédits" />
      )}
    </Shell>
  );
}
