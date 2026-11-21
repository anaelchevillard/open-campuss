import Link from "next/link";
import { ProgressRing } from "@/components/home/progress-ring";
import { Icon } from "@/components/icon";
import { buttonVariants } from "@/components/ui/button";
import { IconCalendar, IconCards, IconReading, IconStreak, IconSubjects, IconTimer, type IconData } from "@/lib/icons";
import type { TodayPlan } from "@/lib/today-plan";

const ACTIONS: Record<TodayPlan["kind"], { label: string; icon: IconData }> = {
  exam: { label: "Réviser", icon: IconCalendar },
  cards: { label: "Réviser", icon: IconCards },
  resume: { label: "Reprendre", icon: IconReading },
  start: { label: "Commencer", icon: IconSubjects },
};

/** La carte du jour : un titre, une ligne, un seul bouton plein. Elle tient dans les 200 premiers pixels au téléphone. */
export function TodayCard({ plan, hideGame }: { plan: TodayPlan; hideGame?: boolean }) {
  const action = ACTIONS[plan.kind];
  const ring = plan.kind === "exam" && plan.readiness !== undefined;
  return (
    <section aria-labelledby="carte-du-jour" className="rounded-2xl bg-card p-4 shadow-sm motion-ok:animate-rise md:p-6">
      <div className="flex items-start gap-4">
        {ring
          ? <ProgressRing value={plan.readiness!} label={`Prêt à ${plan.readiness} %`}>{plan.readiness}%</ProgressRing>
          : <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-text"><Icon icon={action.icon} size={24} /></span>}
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 id="carte-du-jour" className="text-lg leading-snug font-semibold text-balance wrap-break-word">{plan.title}</h2>
          <p className="text-muted-foreground">
            {plan.detail}
            {plan.minutes ? <span className="whitespace-nowrap"> · <Icon icon={IconTimer} size={16} className="inline -translate-y-px" /> {plan.minutes} min</span> : null}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href={plan.href} data-slot="button" className={buttonVariants({ size: "lg" })}>{action.label}</Link>
        {plan.chips.map((chip) => (
          <Link key={chip.href + chip.label} href={chip.href} className="flex min-h-9 items-center rounded-full bg-muted px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent coarse:min-h-11">{chip.label}</Link>
        ))}
        {!hideGame && plan.streak ? (
          <span className="ml-auto flex items-center gap-1 text-sm font-semibold text-muted-foreground tabular-nums" title={`${plan.streak} jours de suite`}>
            <Icon icon={IconStreak} size={16} className="text-warning" />{plan.streak} j
          </span>
        ) : null}
      </div>
    </section>
  );
}
