import { and, asc, count, desc, eq, ilike, inArray, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Notice } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { CourseCardsChoice } from "@/components/revise/course-cards-choice";
import { CoursePickList, CreateModeHeader, type PickCourse } from "@/components/revise/create-mode";
import { Section } from "@/components/revise/revise-parts";
import { Shell } from "@/components/shell";
import { Input } from "@/components/ui/input";
import { readableDocuments } from "@/lib/access";
import { canRead } from "@/lib/access-server";
import { aiAvailable } from "@/lib/ai-available";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { IconSearch, IconUpload } from "@/lib/icons";
import { friendPacks, publicPacks } from "@/lib/memo-packs";
import { inSentence } from "@/lib/subject-name";

export const metadata: Metadata = { title: "Créer des fiches" };

const { documents, favorites, flashcards, memoDecks, readingProgress, subjects } = schema;

// Ce dont on fait des fiches : les cours, TD et fiches de cours ; un sujet de partiel s'entraîne à part (Réviser › Partiels)
const CARD_SOURCES = ["cours", "td", "fiche", "projet"] as const;

/**
 * « Créer des fiches » : un mode à part, avec ses étapes.
 * Sans cours choisi, les cours sont montrés tout de suite (lus récemment, favoris, sinon ceux de la licence) ;
 * un cours choisi ouvre le choix clair : générer avec Campuss IA, les faire soi-même, ou voir les fiches des autres.
 */
export default async function NewCardsPage({ searchParams }: PageProps<"/reviser/fiches/nouveau">) {
  const user = await requireUser();
  const params = await searchParams;
  if (params.cours !== undefined) {
    const id = z.uuid().safeParse(params.cours);
    const [doc] = id.success ? await db.select().from(documents).where(eq(documents.id, id.data)) : [];
    if (!doc || doc.deletedAt || !(await canRead(user, doc))) notFound();
    const [[deck], [mine], library, friends, ai] = await Promise.all([
      db.select({ cards: memoDecks.cards }).from(memoDecks).where(eq(memoDecks.documentId, doc.id)),
      db.select({ id: flashcards.id }).from(flashcards).where(and(eq(flashcards.userId, user.id), eq(flashcards.documentId, doc.id))).limit(1),
      publicPacks(user, "", doc.id),
      friendPacks(user, doc.id),
      aiAvailable(),
    ]);
    const others = new Set([...library, ...friends].filter((row) => row.pack.ownerId !== user.id).map((row) => row.pack.id)).size;
    return (
      <Shell user={user}>
        <CreateModeHeader step={2} lead={<>Pour <span className="font-semibold text-foreground">{doc.title || "Sans titre"}</span> · <Link href="/reviser/fiches/nouveau" className="text-link hover:underline">changer de cours</Link></>} />
        <CourseCardsChoice
          docId={doc.id} aiCards={deck?.cards ?? null} aiReady={ai} others={others} hasMine={Boolean(mine)}
          initial={params.choix === "main" ? "manual" : params.choix === "ia" ? "ai" : null}
        />
      </Shell>
    );
  }

  const query = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const term = query.replace(/[\\%_]/g, (c) => `\\${c}`);
  // Seules les matières de sa licence et de son année : un identifiant venu de l'URL ne sort jamais de cette liste
  const subjectList = user.programId ? await db.select({ id: subjects.id, name: subjects.name, shortName: subjects.shortName }).from(subjects)
    .where(and(eq(subjects.programId, user.programId), eq(subjects.level, user.level ?? 1), isNull(subjects.archivedAt))).orderBy(asc(subjects.position)) : [];
  const subject = subjectList.find((s) => String(s.id) === params.matiere);
  const searching = Boolean(query || subject);
  const fields = { id: documents.id, title: documents.title, chapter: documents.chapter, subject: subjects.name, subjectShort: subjects.shortName };
  const sources = inArray(documents.category, [...CARD_SOURCES]);
  const [recent, favorite, found, [owned]] = await Promise.all([
    searching ? Promise.resolve([]) : db.select(fields).from(readingProgress).innerJoin(documents, eq(readingProgress.documentId, documents.id)).leftJoin(subjects, eq(documents.subjectId, subjects.id))
      .where(and(eq(readingProgress.userId, user.id), readableDocuments(user), isNull(documents.deletedAt), sources)).orderBy(desc(readingProgress.updatedAt)).limit(9),
    searching ? Promise.resolve([]) : db.select(fields).from(favorites).innerJoin(documents, eq(favorites.documentId, documents.id)).leftJoin(subjects, eq(documents.subjectId, subjects.id))
      .where(and(eq(favorites.userId, user.id), readableDocuments(user), isNull(documents.deletedAt), sources)).orderBy(desc(favorites.at)).limit(9),
    searching ? db.select(fields).from(documents).leftJoin(subjects, eq(documents.subjectId, subjects.id))
      .where(and(readableDocuments(user), isNull(documents.deletedAt), sources, query ? ilike(documents.title, `%${term}%`) : undefined, subject ? eq(documents.subjectId, subject.id) : undefined))
      .orderBy(desc(documents.publishedAt)).limit(30) : Promise.resolve([]),
    db.select({ n: count() }).from(flashcards).where(eq(flashcards.userId, user.id)),
  ]);
  const favoriteOnly = favorite.filter((f) => !recent.some((r) => r.id === f.id));
  // Rien de lu ni de favori : les cours de sa licence et de son année, tout de suite, sans écran intermédiaire
  const program = !searching && !recent.length && !favoriteOnly.length && subjectList.length
    ? await db.select(fields).from(documents).innerJoin(subjects, eq(documents.subjectId, subjects.id))
      .where(and(readableDocuments(user), isNull(documents.deletedAt), sources, eq(documents.published, true), inArray(documents.subjectId, subjectList.map((s) => s.id))))
      .orderBy(asc(subjects.position), asc(documents.chapter), desc(documents.publishedAt)).limit(30)
    : [];
  const shown = [...recent, ...favoriteOnly, ...found, ...program].map((c) => c.id);
  const mine = shown.length
    ? new Map((await db.select({ id: flashcards.documentId, n: count() }).from(flashcards).where(and(eq(flashcards.userId, user.id), inArray(flashcards.documentId, shown))).groupBy(flashcards.documentId)).map((r) => [r.id, r.n]))
    : new Map<string | null, number>();
  const pick = (rows: typeof recent): PickCourse[] => rows.map((r) => ({ id: r.id, title: r.title, chapter: r.chapter, subject: r.subjectShort || r.subject, mine: mine.get(r.id) ?? 0 }));
  const href = (matiere?: number) => { const q = new URLSearchParams(); if (query) q.set("q", query); if (matiere) q.set("matiere", String(matiere)); const s = q.toString(); return `/reviser/fiches/nouveau${s ? `?${s}` : ""}`; };
  const title = query ? `Résultats pour « ${query} »${subject ? ` en ${inSentence(subject.name)}` : ""}` : subject ? `Cours de ${inSentence(subject.name)}` : "";
  const firstTime = owned.n === 0;
  return (
    <Shell user={user}>
      <CreateModeHeader step={1} lead="Choisis le cours dont tu veux des fiches." exitHref={firstTime ? "/reviser" : "/reviser/fiches"} />
      {firstTime && !searching && (
        <div className="mb-6 max-w-2xl">
          <Notice tone="info">Tu n’as pas encore de fiches. Choisis un cours ci-dessous : Campuss IA peut les écrire pour toi, ou tu les fais toi-même en quelques secondes.</Notice>
        </div>
      )}
      <div className="mb-8 grid gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <form role="search" className="relative w-full sm:max-w-sm">
            {subject && <input type="hidden" name="matiere" value={subject.id} />}
            <Icon icon={IconSearch} size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" name="q" defaultValue={query} placeholder="Rechercher un cours" aria-label="Rechercher un cours" className="pl-9" />
          </form>
          <Link href="/reviser/fiches/importer" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-link hover:underline"><Icon icon={IconUpload} size={16} />Importer des fiches</Link>
          <Link href="/reviser/fiches?nouvelle=1" className="inline-flex min-h-11 items-center text-sm text-link hover:underline">Fiche sans cours</Link>
        </div>
        {subjectList.length > 0 && (
          <nav aria-label="Filtrer par matière" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
            <Link href={href()} aria-current={!subject ? "true" : undefined} className={chip}>Toutes</Link>
            {subjectList.map((s) => <Link key={s.id} href={href(s.id)} aria-current={subject?.id === s.id ? "true" : undefined} className={chip}>{s.shortName || s.name}</Link>)}
          </nav>
        )}
      </div>
      <div className="grid gap-10 pb-28 md:pb-8">
        {searching
          ? <Section title={title}>{found.length ? <CoursePickList courses={pick(found)} /> : <EmptyState icon={IconSearch} title="Aucun cours trouvé" description={query ? "Essaie un autre mot du titre" : "Pas encore de cours dans cette matière"} />}</Section>
          : (
            <>
              {recent.length > 0 && <Section title="Lus récemment"><CoursePickList courses={pick(recent)} /></Section>}
              {favoriteOnly.length > 0 && <Section title="Mes favoris"><CoursePickList courses={pick(favoriteOnly)} /></Section>}
              {program.length > 0 && <Section title="Cours de ta licence"><CoursePickList courses={pick(program)} /></Section>}
              {!recent.length && !favoriteOnly.length && !program.length && <EmptyState icon={IconSearch} title="Pas encore de cours publié dans ta licence" description="Cherche un cours par son titre, ou crée une fiche sans cours" action={<Link href="/reviser/fiches?nouvelle=1" className="text-link hover:underline">Fiche sans cours</Link>} />}
            </>
          )}
      </div>
    </Shell>
  );
}

const chip = "inline-flex min-h-9 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted coarse:min-h-11 aria-[current]:bg-brand-tint aria-[current]:text-brand-text";
