import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";
import { Icon } from "@/components/icon";
import { trendLabel, type Comparison } from "@/lib/audience-calc";
import { IconChevronRight } from "@/lib/icons";

/**
 * Évolution par rapport à la période précédente. `better` dit dans quel sens c'est une bonne nouvelle
 * (un délai qui baisse est vert) ; le sens se lit aussi dans le signe, pas seulement dans la couleur.
 */
export function TrendBadge({ comparison, better = "up", className }: { comparison: Comparison; better?: "up" | "down"; className?: string }) {
  const text = trendLabel(comparison);
  if (!text) return null;
  const good = comparison.trend === better;
  const bad = (comparison.trend === "up" || comparison.trend === "down") && !good;
  return (
    <span className={cn("inline-flex rounded-md px-1.5 py-px text-xs font-semibold tabular-nums",
      good ? "bg-success-tint text-success-foreground" : bad ? "bg-destructive-tint text-destructive-foreground" : "bg-muted text-muted-foreground", className)}>
      {text}
    </span>
  );
}

/** Un chiffre clé, sa comparaison et, s'il y en a un, le lien vers son détail. */
export function Kpi({ label, value, comparison, better, hint, href }: { label: string; value: ReactNode; comparison?: Comparison; better?: "up" | "down"; hint?: ReactNode; href?: string }) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2 text-sm text-muted-foreground">{label}{href && <Icon icon={IconChevronRight} size={16} className="shrink-0" />}</span>
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><span className="text-2xl leading-tight font-semibold tabular-nums">{value}</span>{comparison && <TrendBadge comparison={comparison} better={better} />}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </>
  );
  const cls = "grid min-w-0 content-start gap-1 rounded-xl bg-card p-4 shadow-xs";
  return href ? <Link href={href} className={cn(cls, "transition-shadow hover-ok:shadow-sm focus-visible:ring-2 focus-visible:ring-ring outline-none")}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** Une section de la page : titre, phrase qui dit ce qu'on compte, contenu. */
export function Panel({ id, title, lead, action, children, className }: { id: string; title: string; lead?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn("grid min-w-0 content-start gap-3 rounded-xl bg-card p-4 shadow-xs md:p-5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={id} className="font-sans text-base font-semibold">{title}</h2>
        {action}
      </div>
      {lead && <p className="-mt-2 text-sm text-muted-foreground">{lead}</p>}
      {children}
    </section>
  );
}
