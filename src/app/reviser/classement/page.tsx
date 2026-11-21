import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "cn";
import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";
import { SeasonBanner } from "@/components/habits";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { ReviseTabs } from "@/components/revise/revise-parts";
import { Shell } from "@/components/shell";
import { UserName } from "@/components/user-name";
import { namer } from "@/lib/user-name";
import { profilesOf } from "@/lib/profile-data";
import { requireUser } from "@/lib/auth";
import { cardCounts } from "@/lib/card-counts";
import { db, schema } from "@/lib/db";
import { levelOf, ranking, seasonOf } from "@/lib/gamification";
import { seasonDismissedBy } from "@/lib/habits";
import { IconCredits, IconRanking, IconTrophy } from "@/lib/icons";
import { lastDayOf, seasonBanner } from "@/lib/seasons";
import { featureOn } from "@/lib/site-settings";
import { inSentence } from "@/lib/subject-name";

export const metadata: Metadata = { title: "Classement" };

const chip = "inline-flex min-h-9 shrink-0 items-center rounded-full px-3 text-sm font-semibold transition-colors coarse:min-h-11";

export default async function RankingPage({ searchParams }: PageProps<"/reviser/classement">) {
  const user = await requireUser();
  if (!(await featureOn("ranking"))) notFound();
  const cards = await cardCounts(user.id);
  const params = await searchParams;
  const overall = params.periode === "tout";
  const season = seasonOf(new Date());
  // Seules les matières de sa licence : un identifiant venu de l'URL ne sort jamais de cette liste
  const subjects = user.programId ? await db.select({ id: schema.subjects.id, name: schema.subjects.name, shortName: schema.subjects.shortName }).from(schema.subjects).where(and(eq(schema.subjects.programId, user.programId), eq(schema.subjects.level, user.level ?? 1))).orderBy(asc(schema.subjects.position)) : [];
  const subject = subjects.find((s) => String(s.id) === params.matiere);
  const nameOf = await namer(user);
  const rows = (user.programId ? await ranking(user.programId, overall ? undefined : season.start, undefined, subject?.id) : []).map((row) => ({ ...row, person: { ...row.person, name: nameOf(row.person) } }));
  const profiles = await profilesOf(rows.map((row) => row.person.id));
  const banner = seasonBanner(season, await seasonDismissedBy(user.id), new Date());
  const shortSeason = `Saison ${season.label.startsWith("Automne") ? "d’automne" : "de printemps"} · jusqu’au ${lastDayOf(season)}`;
  const href = (periode: boolean, matiere?: number) => { const query = [periode ? "periode=tout" : "", matiere ? `matiere=${matiere}` : ""].filter(Boolean).join("&"); return `/reviser/classement${query ? `?${query}` : ""}`; };
  return (
    <Shell user={user}>
      <PageHeader title="Réviser" shortTitle="Classement" tabs={<ReviseTabs value="ranking" ranking due={cards.due} />} />
      {banner && <SeasonBanner text={banner.fresh ? `Nouvelle saison · jusqu’au ${lastDayOf(season)}` : shortSeason} />}
      <div className="grid max-w-3xl gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-full bg-muted p-1" role="group" aria-label="Période">
            <Link href={href(false, subject?.id)} aria-current={!overall ? "true" : undefined} className={cn(chip, !overall ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}>{season.label}</Link>
            <Link href={href(true, subject?.id)} aria-current={overall ? "true" : undefined} className={cn(chip, overall ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}>Depuis le début</Link>
          </div>
          <p className="text-sm text-muted-foreground">{shortSeason}</p>
        </div>
        {subjects.length > 0 && (
          <nav aria-label="Classement par matière" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
            <Link href={href(overall)} aria-current={!subject ? "true" : undefined} className={cn(chip, "text-muted-foreground hover:bg-muted aria-[current]:bg-brand-tint aria-[current]:text-brand-text")}>Toutes</Link>
            {subjects.map((s) => <Link key={s.id} href={href(overall, s.id)} aria-current={subject?.id === s.id ? "true" : undefined} className={cn(chip, "text-muted-foreground hover:bg-muted aria-[current]:bg-brand-tint aria-[current]:text-brand-text")}>{s.shortName || s.name}</Link>)}
          </nav>
        )}
        {!user.showInRanking && <p className="text-sm text-muted-foreground">Tu n’y figures pas · <Link className="text-link hover:underline" href="/parametres/confidentialite#visibilite">Y apparaître</Link></p>}
        {rows.length ? (
          <ol className="stagger grid gap-1">
            {rows.map((row, index) => (
              <li key={row.person.id}>
                <Link href={`/u/${row.person.id}`} className={cn("flex min-h-16 items-center gap-3 rounded-xl px-3 py-2 transition-colors hover-ok:bg-muted", index < 3 && "bg-card shadow-xs", row.person.id === user.id && "ring-2 ring-inset ring-brand-tint")}>
                  <span className={cn("grid w-8 place-items-center text-lg font-semibold tabular-nums", index === 0 ? "text-brand-text" : "text-muted-foreground")}>{index < 3 ? <Icon icon={IconTrophy} size={24} label={`${index + 1}e`} className={index === 0 ? "trophy" : ""} /> : index + 1}</span>
                  <Avatar user={row.person} size={40} />
                  <span className="grid min-w-0 flex-1"><UserName user={row.person} profile={profiles.get(row.person.id)} variant="rich" list self={row.person.id === user.id} className="truncate" /><span className="text-sm text-muted-foreground">{levelOf(row.credits).name}</span></span>
                  <span className="flex items-center gap-1 tabular-nums"><Icon icon={IconCredits} size={16} className="text-brand-text" />{row.credits}<span className="sr-only"> crédits</span></span>
                </Link>
              </li>
            ))}
          </ol>
        ) : <EmptyState icon={IconRanking} title={`Personne pour l’instant${subject ? ` en ${inSentence(subject.shortName || subject.name)}` : ""}`} description="Partage un cours et prends la première place" />}
      </div>
    </Shell>
  );
}
