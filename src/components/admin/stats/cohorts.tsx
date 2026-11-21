"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatSeconds, percent, type FunnelView, type RetentionCell, type RetentionLine } from "@/lib/audience-calc";

const cohortName = (day: string, unit: "week" | "month") => {
  const date = new Date(`${day}T12:00:00Z`);
  return unit === "week"
    ? `Sem. du ${date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" })}`
    : date.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
};

const columnName = (k: number, scale: "days" | "weeks") => (scale === "days" ? `J+${k}` : `S${k}`);

function Cell({ cell, signed, cohort, scale }: { cell: RetentionCell; signed: number; cohort: string; scale: "days" | "weeks" }) {
  if (cell.rate === null) return <td className="px-1 py-1"><span className="flex h-9 items-center justify-center rounded-md text-xs text-muted-foreground" title="Trop tôt pour mesurer">·</span></td>;
  // Intensité de la couleur de marque selon le taux, texte toujours lisible (fond clair sous 45 %)
  const strength = Math.round(8 + cell.rate * 72);
  return (
    <td className="px-1 py-1">
      <Tooltip>
        <TooltipTrigger render={<div tabIndex={0} className="flex h-9 items-center justify-center rounded-md text-sm font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ background: `color-mix(in oklab, var(--chart-1) ${strength}%, var(--card))`, color: cell.rate >= 0.45 ? "var(--primary-foreground)" : "var(--foreground)" }} />}>
          {percent(cell.rate)}
        </TooltipTrigger>
        <TooltipContent>{cohort} : {cell.n} sur {signed} {scale === "days" ? `revenus à J+${cell.k} ou après` : `actifs la semaine ${cell.k}`}</TooltipContent>
      </Tooltip>
    </td>
  );
}

/**
 * Tableau de cohortes : une ligne par semaine (ou mois) d'inscription, une colonne par délai. `scale` : délais en
 * jours (J+1, J+7, J+30, « revenu ou après ») ou semaines (S1 à S8, « actif cette semaine-là »).
 */
export function RetentionGrid({ lines, average, unit, scale = "days", empty = "Aucune inscription sur ces cohortes.", first = "Inscrits" }: {
  lines: RetentionLine[]; average: RetentionCell[]; unit: "week" | "month"; scale?: "days" | "weeks"; empty?: string; first?: string;
}) {
  if (!lines.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const totalSigned = lines.reduce((a, l) => a + l.signed, 0);
  return (
    <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <table className="w-full min-w-[22rem] border-separate border-spacing-0 text-sm">
        <caption className="sr-only">{scale === "days" ? "Part de chaque cohorte revenue à J+1, J+7 et J+30" : "Part de chaque cohorte active chaque semaine après son début"}</caption>
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th scope="col" className="py-1 pr-2 font-normal">Cohorte</th>
            <th scope="col" className="px-1 py-1 text-right font-normal">{first}</th>
            {average.map((c) => <th key={c.k} scope="col" className="px-1 py-1 text-center font-normal">{columnName(c.k, scale)}</th>)}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.cohort}>
              <th scope="row" className="py-1 pr-2 text-left font-normal whitespace-nowrap">{cohortName(line.cohort, unit)}</th>
              <td className="px-1 py-1 text-right tabular-nums text-muted-foreground">{line.signed}</td>
              {line.cells.map((cell) => <Cell key={cell.k} cell={cell} signed={line.signed} cohort={cohortName(line.cohort, unit)} scale={scale} />)}
            </tr>
          ))}
          <tr className="font-semibold">
            <th scope="row" className="border-t border-border py-2 pr-2 text-left">Moyenne pondérée</th>
            <td className="border-t border-border px-1 py-2 text-right tabular-nums">{totalSigned}</td>
            {average.map((c) => <td key={c.k} className="border-t border-border px-1 py-2 text-center tabular-nums">{percent(c.rate)}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Entonnoir en barres décroissantes : part du départ, passage depuis l'étape d'avant, perdus, délai médian. */
export function FunnelChart({ steps, previous }: { steps: FunnelView[]; previous: FunnelView[] }) {
  return (
    <ol className="grid gap-3">
      {steps.map((step, i) => {
        const before = previous[i];
        return (
          <li key={step.id} className="grid gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="font-semibold">{step.label}</span>
              <span className="tabular-nums"><span className="font-semibold">{step.n.toLocaleString("fr-FR")}</span><span className="text-muted-foreground"> · {percent(step.ofFirst)}</span></span>
            </div>
            <Tooltip>
              <TooltipTrigger render={<div tabIndex={0} aria-label={`${step.label} : ${step.n}, ${percent(step.ofFirst)} des inscrits`} className="h-7 overflow-hidden rounded-md bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring" />}>
                <div className="h-full rounded-md bg-(--chart-1)" style={{ width: `${(step.ofFirst ?? 0) * 100}%` }} />
              </TooltipTrigger>
              <TooltipContent className="grid gap-0.5 text-left">
                <span className="font-semibold">{step.label}</span>
                <span>{step.n} personne{step.n > 1 ? "s" : ""}, {percent(step.ofFirst)} des inscrits</span>
                {step.ofPrevious !== null && <span>{percent(step.ofPrevious)} de l’étape précédente · {step.lost} perdu{step.lost > 1 ? "s" : ""}</span>}
                {step.medianSeconds != null && <span>Délai médian depuis l’inscription : {formatSeconds(step.medianSeconds)}</span>}
                {before && <span>Période précédente : {before.n} ({percent(before.ofFirst)})</span>}
              </TooltipContent>
            </Tooltip>
            {step.ofPrevious !== null && <p className="text-xs text-muted-foreground">{percent(step.ofPrevious)} de l’étape précédente{step.medianSeconds != null ? ` · médiane ${formatSeconds(step.medianSeconds)} après l’inscription` : ""}</p>}
          </li>
        );
      })}
    </ol>
  );
}
