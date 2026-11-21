import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { StartButton } from "@/components/revise/start-bar";
import { buttonVariants } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { UserName } from "@/components/user-name";
import type { UserProfile } from "@/lib/db/schema";
import type { TodayPlan } from "@/lib/today-plan";
import { IconCards, IconChevronRight, IconDuel, IconGift, IconGoal, IconXp } from "@/lib/icons";
import type { QuestView } from "@/lib/quests";
import type { Readiness } from "@/lib/readiness";
import { parisDay, shiftDay } from "@/lib/study-habits";
import { WEEKLY_TIERS } from "@/lib/xp";

/** Onglets de Réviser, chacun dans l'URL. Classement absent quand la fonction est coupée. */
export function ReviseTabs({ value, ranking, due }: { value: "today" | "cards" | "exams" | "together" | "ranking"; ranking: boolean; due?: number }) {
  const items = [
    { value: "today", label: "Aujourd’hui", href: "/reviser" },
    // Les fiches ont leur onglet, avec ce qui est à revoir
    { value: "cards", label: "Fiches", href: "/reviser/fiches", count: due },
    { value: "exams", label: "Partiels", href: "/reviser/partiels" },
    { value: "together", label: "Ensemble", href: "/reviser/ensemble" },
    ...(ranking ? [{ value: "ranking", label: "Classement", href: "/reviser/classement" }] : []),
  ];
  return <SegmentedTabs items={items} value={value} label="Réviser" />;
}

/** Une section titrée, l'espace entre groupes faisant le reste. */
export function Section({ title, action, children, className, label }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; label?: string }) {
  return (
    <section aria-label={label ?? (typeof title === "string" ? title : undefined)} className={cn("grid content-start gap-3", className)}>
      {(title || action) && <div className="flex items-baseline justify-between gap-3">{title && <h2 className="heading">{title}</h2>}{action}</div>}
      {children}
    </section>
  );
}

/** Carte « Séance du jour » : un seul bouton plein. Au téléphone, il se colle en bas une fois la carte dépassée. */
export function TodayCard({ plan }: { plan: TodayPlan }) {
  const label = `Commencer${plan.minutes ? ` · ${plan.minutes} min` : ""}`;
  const start = plan.kind === "resume" ? "Reprendre" : plan.kind === "start" ? "Choisir un cours" : label;
  return (
    <section aria-label="Séance du jour" className="grid gap-5 rounded-2xl bg-card p-5 shadow-sm md:p-6">
      <div className="grid gap-1.5">
        <p className="text-sm text-muted-foreground">{plan.kind === "exam" ? plan.detail : plan.kind === "cards" ? "Séance du jour" : plan.kind === "resume" ? "À reprendre" : "Pour commencer"}</p>
        <h2 className="title text-balance">{plan.kind === "cards" ? plan.detail : plan.title}</h2>
        {plan.kind === "exam" && plan.session && <p className="text-muted-foreground">{[plan.session.cards && `${plan.session.cards} fiches`, plan.session.fresh && `${plan.session.fresh} nouvelles`, plan.session.questions && `${plan.session.questions} questions`].filter(Boolean).join(" · ")}</p>}
        {plan.readiness !== undefined && <p className="text-sm text-muted-foreground tabular-nums">Prêt à {plan.readiness} %</p>}
      </div>
      {plan.chips.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Matières de la séance">
          {plan.chips.map((chip) => <li key={chip.href}><Link href={chip.href} className="inline-flex min-h-8 items-center rounded-full bg-muted px-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground coarse:min-h-10">{chip.label}</Link></li>)}
        </ul>
      )}
      <StartButton href={plan.href} label={start} />
    </section>
  );
}

/** Trois quêtes : la ligne faite se barre et descend. Paliers de la semaine annoncés d'avance. */
export function QuestList({ quests, fullDays }: { quests: QuestView[]; fullDays: number }) {
  const sorted = [...quests].sort((a, b) => Number(a.done) - Number(b.done));
  return (
    <div className="grid gap-4">
      <ol className="stagger grid gap-1">
        {sorted.map((quest) => (
          <li key={quest.quest}>
            <Link href={quest.href} className={cn("group flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover-ok:bg-muted", quest.done && "text-muted-foreground")}>
              <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors duration-(--dur-base)", quest.done ? "border-transparent bg-success-tint text-success-foreground" : "border-input")}>
                {quest.done && <svg viewBox="0 0 16 16" className="size-4" aria-hidden><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="[stroke-dasharray:16] motion-ok:animate-[draw_300ms_var(--ease-out)_both]" /></svg>}
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className={cn("text-sm font-semibold decoration-2 transition-[text-decoration-color] duration-(--dur-slow)", quest.done ? "line-through decoration-current" : "decoration-transparent")}>{quest.label}</span>
                {!quest.done && quest.target > 1 && <span className="text-xs text-muted-foreground tabular-nums">{quest.progress}/{quest.target}</span>}
              </span>
              {quest.done ? <span className="sr-only">fait</span> : <Icon icon={IconChevronRight} size={16} className="text-muted-foreground" />}
            </Link>
          </li>
        ))}
      </ol>
      <div className="grid gap-2">
        <p className="text-xs text-muted-foreground">Paliers de la semaine · {fullDays} {fullDays > 1 ? "jours" : "jour"} de quêtes</p>
        <ol className="grid grid-cols-3 gap-2">
          {WEEKLY_TIERS.map((tier) => {
            const reached = fullDays >= tier.days;
            return (
              <li key={tier.days} className={cn("flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold tabular-nums", reached ? "bg-brand-tint text-brand-text" : "bg-muted text-muted-foreground")} aria-label={`${tier.days} jours : ${tier.xp} XP${reached ? ", atteint" : ""}`}>
                <Icon icon={IconGift} size={16} />{tier.days} j · +{tier.xp}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

type LeagueData = { rows: { id: string; name: string; xp: number; cards: number; rank: number; me?: boolean; avatarKey: string | null; profile?: UserProfile | null }[]; total: number; target: number; percent: number };

/** Ligue d'amis : l'objectif commun d'abord, puis le rang. Pas de relégation, remise à zéro le lundi. */
export function LeagueCard({ league, compact }: { league: LeagueData; compact?: boolean }) {
  const rows = compact ? league.rows.slice(0, 5) : league.rows;
  const monday = shiftDay(parisDay(new Date()), 7 - ((new Date().getDay() + 6) % 7));
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <p className="text-sm"><span className="font-semibold tabular-nums">À vous {league.rows.length} : {league.total.toLocaleString("fr-FR")} / {league.target.toLocaleString("fr-FR")}</span> <span className="text-muted-foreground">fiches cette semaine</span></p>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Objectif commun" aria-valuenow={league.percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary motion-ok:animate-[grow_600ms_var(--ease-out)_both] origin-left" style={{ width: `${league.percent}%` }} />
        </div>
      </div>
      <ol className="stagger grid gap-1">
        {rows.map((row) => (
          <li key={row.id} className={cn("flex min-h-11 items-center gap-3 rounded-lg px-2", row.me && "bg-brand-tint")}>
            <span className={cn("w-5 text-center text-sm font-semibold tabular-nums", row.rank === 1 ? "text-brand-text" : "text-muted-foreground")}>{row.rank}</span>
            <Avatar user={{ id: row.id, name: row.name, avatarKey: row.avatarKey }} size={28} />
            <span className="min-w-0 flex-1 truncate text-sm">{row.me ? <span className="font-semibold">Toi</span> : <UserName user={row} profile={row.profile} variant="rich" showBadge list />}</span>
            <span className="flex items-center gap-1 text-sm tabular-nums text-muted-foreground"><Icon icon={IconXp} size={16} />{row.xp}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">Nouvelle semaine le lundi {new Date(`${monday}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</p>
    </div>
  );
}

const MODES = [
  { key: "classique", label: "Classique", line: "Tes fiches, au bon moment", href: "/reviser/seance", icon: IconCards },
  { key: "eclair", label: "Éclair", line: "60 s pour associer", href: "/reviser/seance?mode=eclair", icon: IconXp },
  { key: "partiel", label: "Partiel blanc", line: "10 questions chronométrées", href: "/reviser/seance?mode=partiel", icon: IconGoal },
  { key: "defi", label: "Défier un ami", line: "Ton score à battre", href: "/reviser/ensemble#defis", icon: IconDuel },
] as const;

/** Modes de jeu : grille 2 × 2 au téléphone et sur tablette, une ligne de quatre sur grand écran. */
export function Modes({ duels }: { duels: boolean }) {
  const modes = MODES.filter((mode) => duels || mode.key !== "defi");
  return (
    <ul className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {modes.map((mode) => (
        <li key={mode.key} className="min-w-0">
          <Link href={mode.href} className="group grid h-full content-start gap-3 rounded-xl bg-card p-4 shadow-xs transition-[translate,box-shadow] duration-(--dur-base) hover-ok:shadow-sm hover-ok:motion-ok:-translate-y-0.5 active:scale-[.985]">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-tint text-brand-text"><Icon icon={mode.icon} /></span>
            <span className="grid gap-0.5">
              <span className="font-semibold">{mode.label}</span>
              <span className="text-sm text-muted-foreground">{mode.line}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Préparation par matière, en barres. Une matière sans données dit pourquoi en une ligne. */
export function ReadinessBars({ rows }: { rows: { id: number; name: string; result: Readiness }[] }) {
  return (
    <ul className="grid gap-3">
      {rows.map(({ id, name, result }) => (
        <li key={id}>
          <Link href={`/reviser/seance?matiere=${id}`} className="grid gap-1.5 rounded-lg px-2 py-2 transition-colors hover-ok:bg-muted">
            <span className="flex items-baseline justify-between gap-3"><span className="min-w-0 truncate text-sm font-semibold">{name}</span>{result.known ? <span className="text-sm font-semibold tabular-nums">{result.percent} %</span> : <span className="text-xs text-muted-foreground">à estimer</span>}</span>
            <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden><span className="block h-full origin-left rounded-full bg-primary motion-ok:animate-[grow_600ms_var(--ease-out)_both]" style={{ width: `${result.known ? result.percent : 0}%` }} /></span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export { HeatMap } from "./heat-map";


const cardsWord = (n: number) => `${n} ${n > 1 ? "fiches" : "fiche"}`;

/**
 * L'entrée « Mes fiches » de Réviser, au même rang que la séance du jour.
 * Ce qui est à revoir d'abord ; sans fiche, l'action mène droit aux cours.
 */
export function CardsEntry({ total, due }: { total: number; due: number }) {
  const line = total === 0
    ? "Choisis un cours : Campuss IA les écrit, ou fais-les toi-même"
    : due > 0 ? `${due} à revoir · ${cardsWord(total)}` : `Tout est à jour · ${cardsWord(total)}`;
  return (
    <section aria-labelledby="mes-fiches-entree" className="flex flex-wrap items-center gap-4 rounded-2xl bg-card p-4 shadow-xs md:p-5">
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand-text"><Icon icon={IconCards} size={24} /></span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <h2 id="mes-fiches-entree" className="text-lg leading-snug font-semibold"><Link href="/reviser/fiches" className="underline-offset-2 hover:underline">Mes fiches</Link></h2>
        <p className="text-sm text-muted-foreground tabular-nums">{line}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {total === 0
          ? <Link href="/reviser/fiches/nouveau" data-slot="button" className={buttonVariants({ variant: "outline" })}>Créer des fiches</Link>
          : (
            <>
              <Link href="/reviser/fiches" data-slot="button" className={buttonVariants({ variant: "outline" })}>Ouvrir</Link>
              {due > 0 && <Link href="/reviser/seance?mode=fiches" data-slot="button" className={buttonVariants({ variant: "ghost" })} aria-label={`Réviser mes fiches (${due})`}>Réviser<span className="tabular-nums opacity-80">{due}</span></Link>}
            </>
          )}
      </div>
    </section>
  );
}
