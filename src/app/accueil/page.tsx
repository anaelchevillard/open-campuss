import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Checklist } from "@/components/checklist";
import { DocCard, DocGrid } from "@/components/doc-card";
import { EmptyState } from "@/components/empty-state";
import { favoriteIds, lastReads, requestsInMySubjects, semesterDocs, subjectTiles, yourTurn } from "@/components/home/data";
import { ProgramSelect } from "@/components/home/program-select";
import { SubjectsSection } from "@/components/home/subjects-section";
import { TodayCard } from "@/components/home/today-card";
import { HomeWidgets } from "@/components/home/widgets";
import { YearMenu } from "@/components/home/year-menu";
import { Icon } from "@/components/icon";
import { PageTitle } from "@/components/page-title";
import { ReturnBlock } from "@/components/return-block";
import { SemesterSwitch } from "@/components/semester-switch";
import { Shell } from "@/components/shell";
import { Progress } from "@/components/ui/progress";
import { requireUser } from "@/lib/auth";
import { listPrograms, viewedProgram, viewedTerm } from "@/lib/catalog";
import { checklistFor } from "@/lib/checklist-server";
import { cardCounts } from "@/lib/card-counts";
import { categoryCountsLabel, totalOf } from "@/lib/category-counts";
import { habitSnapshot } from "@/lib/habits";
import { IconCards, IconChevronRight, IconFavorite, IconRequests, IconSubjects } from "@/lib/icons";
import { absoluteSemester, subjectsForSemester } from "@/lib/semester";
import { todayPlan } from "@/lib/today-plan";

export const metadata: Metadata = { title: "Accueil" };

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");
const plural = (n: number, word: string) => `${n} ${word}${n > 1 && !word.endsWith("s") ? "s" : ""}`;
const today = () => {
  const text = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "short", timeZone: "Europe/Paris" }).format(new Date());
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Accueil : une action principale (la carte du jour), puis ce qui se rouvre en un clic. */
/** L'accueil connecté vit ici ; « / » est la présentation. Sans session, requireUser mène à la connexion. */
export default async function HomePage({ searchParams }: PageProps<"/accueil">) {
  const user = await requireUser();
  const params = await searchParams;
  if (user.role === "teacher") redirect("/enseignant");
  // La recherche vit dans Matières : les anciens liens « /?q= » y mènent
  const q = one(params.q).trim().slice(0, 200);
  if (q) redirect(`/matieres?q=${encodeURIComponent(q)}`);
  const isAdmin = user.role === "admin";
  const programs = await listPrograms();
  // Un membre ne choisit jamais sa licence dans l'adresse : seule celle de son compte s'applique
  const program = await viewedProgram(user, one(params.licence));
  if (!program) {
    return <Shell user={user}><EmptyState icon={IconSubjects} title="Ton compte n’est rattaché à aucune licence" description="Écris à un administrateur pour qu’il t’en attribue une" /></Shell>;
  }
  const { level, parity, current } = await viewedTerm(user, params.semestre);
  const subjects = await subjectsForSemester(program.id, level, parity);
  const ids = subjects.map((s) => s.id);
  const [plan, checklist, reads, tiles, favorites, news, turn, habit, waiting, favIds, cards] = await Promise.all([
    todayPlan(user),
    isAdmin ? null : checklistFor(user),
    lastReads(user),
    subjectTiles(user, ids),
    semesterDocs(user, ids, "favorites"),
    semesterDocs(user, ids, "recent"),
    yourTurn(user),
    user.prefs.hideGame ? null : habitSnapshot(user.id).catch(() => null),
    requestsInMySubjects(user),
    favoriteIds(user.id),
    cardCounts(user.id),
  ]);
  const streak = habit?.streak ?? 0;

  const turnList = turn.length > 0 && (
    <section aria-labelledby="a-toi" className="grid gap-2">
      <h2 id="a-toi" className="heading">À toi de jouer</h2>
      <ul className="stagger grid gap-1 rounded-xl bg-card p-1.5 shadow-xs">
        {turn.map((item) => (
          <li key={item.key}>
            <Link href={item.href} className="flex min-h-11 items-center gap-3 rounded-lg px-2.5 transition-colors hover:bg-muted">
              <span className="min-w-0 flex-1 truncate font-semibold">{item.label}</span>
              {item.count ? <span className="rounded-full bg-primary px-2 text-xs leading-5 font-semibold text-primary-foreground tabular-nums">{item.count}</span> : null}
              <Icon icon={IconChevronRight} size={16} className="text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );

  const tilesGrid = subjects.length ? (
    <div className="@container">
      <ul className="stagger grid gap-3 @[30rem]:grid-cols-2 @[52rem]:grid-cols-3">
        {subjects.map((s) => {
          const kinds = tiles.counts.get(s.id) ?? {};
          const total = totalOf(kinds);
          const done = Math.min(total, tiles.done.get(s.id) ?? 0);
          return (
            <li key={s.id}>
              <Link href={`/matieres/${s.id}`} className={`flex h-full flex-col gap-1 rounded-xl bg-card p-4 shadow-xs transition-[box-shadow,translate,scale] duration-(--dur-base) ease-out hover-ok:shadow-sm motion-ok:hover-ok:-translate-y-0.5 motion-ok:active:scale-[.985] ${total ? "" : "opacity-70"}`}>
                <span className="card-title font-semibold text-balance">{s.name}</span>
                <span className="text-sm text-muted-foreground tabular-nums">{categoryCountsLabel(kinds)}</span>
                {total > 0 && <span className="mt-auto flex items-center gap-2 pt-2"><Progress value={(done / total) * 100} className="flex-1" aria-label={`${done} sur ${total} révisés`} /><span className="text-xs text-muted-foreground tabular-nums">{done}/{total}</span></span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  ) : <EmptyState icon={IconSubjects} title="Aucune matière ce semestre" description={isAdmin ? <Link className="text-link underline-offset-2 hover:underline" href="/admin/licences">Classer les matières</Link> : undefined} />;

  const favoritesGrid = favorites.length
    ? <div className="grid gap-3"><DocGrid>{favorites.map((d) => <li key={d.id}><DocCard doc={d} meta={d.subject ?? undefined} favorite /></li>)}</DocGrid><Link href="/matieres?favoris=1" className="justify-self-start text-sm font-semibold text-link hover:underline">Tous les favoris</Link></div>
    : <EmptyState icon={IconFavorite} title="Aucun favori ce semestre" description="L’étoile d’un cours le garde ici" />;

  return (
    <Shell user={user}>
      <PageTitle title="Accueil" />
      <h1 className="sr-only">Accueil</h1>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="mr-auto text-sm font-semibold text-muted-foreground">{today()} · L{level} · S{absoluteSemester(level, parity)}</p>
        {isAdmin && <ProgramSelect current={program.slug} programs={programs.map((p) => ({ slug: p.slug, name: p.name, active: p.active }))} />}
        <YearMenu level={level} />
        <Suspense><SemesterSwitch level={level} value={parity} current={current} /></Suspense>
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-x-8">
        <div className="grid gap-2 lg:col-start-1">
          <TodayCard plan={plan} hideGame={user.prefs.hideGame} />
          {/* Les fiches à un clic depuis l'accueil, avec ce qui est à revoir */}
          <Link href={cards.total ? "/reviser/fiches" : "/reviser/fiches/nouveau"} className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors hover-ok:bg-muted">
            <Icon icon={IconCards} size={20} className="text-brand-text" />
            <span className="min-w-0 flex-1"><span className="font-semibold">Mes fiches</span><span className="text-muted-foreground tabular-nums"> · {cards.total === 0 ? "créer mes premières fiches" : cards.due > 0 ? `${cards.due} à revoir` : `${plural(cards.total, "fiche")}, tout est à jour`}</span></span>
            <Icon icon={IconChevronRight} size={16} className="text-muted-foreground" />
          </Link>
        </div>
        <aside aria-label="En ce moment" className={`${turnList ? "grid" : "hidden lg:grid"} content-start gap-6 lg:col-start-2 lg:row-span-6 lg:row-start-1`}>
          {turnList}
          <Suspense><HomeWidgets user={user} programId={program.id} level={level} streak={habit ? streak : null} /></Suspense>
        </aside>
        {checklist && <div className="lg:col-start-1"><Checklist steps={checklist} account={user.id} /></div>}
        {reads.length > 0 && (
          <section aria-labelledby="reprendre" className="grid gap-3 lg:col-start-1">
            <h2 id="reprendre" className="heading">Reprendre</h2>
            <ul className="stagger -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
              {reads.map((d) => (
                <li key={d.id} className="w-[78%] shrink-0 snap-start md:w-auto">
                  <DocCard doc={d} meta={d.subject ?? undefined} favorite={favIds.has(d.id)} divider={false} footer={<Progress value={d.percent} aria-label={`Lu à ${d.percent} %`} />} />
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="lg:col-start-1">
          <SubjectsSection all={tilesGrid} favorites={favoritesGrid} favoriteCount={favorites.length} />
        </div>
        {news.length > 0 && (
          <section aria-labelledby="nouveautes" className="grid gap-3 lg:col-start-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="nouveautes" className="heading">Nouveautés</h2>
              <Link href="/matieres?tri=recent" className="text-sm font-semibold text-link hover:underline">Voir tout</Link>
            </div>
            <ReturnBlock user={user} />
            <DocGrid>{news.map((d) => <li key={d.id}><DocCard doc={d} meta={d.subject ?? undefined} favorite={favIds.has(d.id)} /></li>)}</DocGrid>
          </section>
        )}
        {waiting > 0 && (
          <Link href="/demandes" className="flex min-h-11 items-center gap-2 justify-self-start rounded-full bg-brand-tint px-4 text-sm font-semibold text-brand-text lg:col-start-1">
            <Icon icon={IconRequests} size={16} />{waiting > 1 ? `${waiting} demandes dans tes matières` : "1 demande dans tes matières"}
          </Link>
        )}
      </div>
    </Shell>
  );
}
