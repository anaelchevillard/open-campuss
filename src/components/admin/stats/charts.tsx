"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";
import { cn } from "cn";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { addDays, compare, formatSeconds, percent, trendLabel, type SeriesPoint } from "@/lib/audience-calc";
import { TrendBadge } from "@/components/admin/stats/trend";

export type Unit = "count" | "percent" | "seconds";

export const formatValue = (value: number | null, unit: Unit = "count") =>
  value === null ? "—" : unit === "percent" ? percent(value) : unit === "seconds" ? formatSeconds(value) : Math.round(value).toLocaleString("fr-FR");

const short = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const long = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const config = {
  current: { label: "Cette période", color: "var(--chart-1)" },
  previous: { label: "Période précédente", color: "var(--chart-5)" },
} satisfies ChartConfig;

/**
 * Courbe (ou colonnes) de la période, avec la période précédente en pointillé. Au survol : la date, la valeur, celle de
 * la période précédente au même rang, et l'écart. `shift` : longueur de la période (pour dater le point précédent).
 */
export function TrendChart({ data, label, unit = "count", kind = "area", shift, bucket = 1, height = "h-56" }: {
  data: SeriesPoint[]; label: string; unit?: Unit; kind?: "area" | "bar"; shift: number; bucket?: number; height?: string;
}) {
  const gradient = `fill-${useId().replace(/:/g, "")}`;
  const when = (day: string) => (bucket > 1 ? `Semaine du ${short(day)}` : long(day));
  const total = data.reduce((a, p) => a + p.current, 0);
  const summary = `${label} : ${data.length} points du ${short(data[0]?.day ?? "")} au ${short(data.at(-1)?.day ?? "")}${unit === "count" ? `, total ${total.toLocaleString("fr-FR")}` : ""}.`;
  const tooltip = (
    <ChartTooltip
      cursor={kind === "bar" ? { fill: "var(--muted)" } : { stroke: "var(--border)" }}
      content={({ active, payload }) => {
        const point = payload?.[0]?.payload as SeriesPoint | undefined;
        if (!active || !point) return null;
        const c = compare(point.current, point.previous);
        return (
          <div className="grid min-w-44 gap-1.5 rounded-lg border border-border/50 bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-xl">
            <p className="font-semibold first-letter:uppercase">{when(point.day)}</p>
            <p className="flex items-center justify-between gap-4"><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] bg-(--color-current)" />{label}</span><span className="font-semibold tabular-nums">{formatValue(point.current, unit)}</span></p>
            {point.previous !== null && (
              <p className="flex items-center justify-between gap-4 text-muted-foreground"><span className="flex items-center gap-1.5"><span className="w-0 self-stretch border-l-2 border-dashed border-(--color-previous)" />{bucket > 1 ? `Sem. du ${short(addDays(point.day, -shift))}` : short(addDays(point.day, -shift))}</span><span className="tabular-nums">{formatValue(point.previous, unit)}</span></p>
            )}
            {trendLabel(c) && <p className="text-muted-foreground">Écart : <TrendBadge comparison={c} /></p>}
          </div>
        );
      }}
    />
  );
  const axes = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={short} />
      <YAxis tickLine={false} axisLine={false} width={unit === "seconds" ? 64 : 44} allowDecimals={unit === "percent"} tickFormatter={(v: number) => formatValue(v, unit)} />
    </>
  );
  return (
    <figure className="grid gap-2">
      <ChartContainer config={config} className={cn("aspect-auto w-full", height)} role="img" aria-label={summary}>
        {kind === "bar" ? (
          <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
            {axes}
            {tooltip}
            <Bar dataKey="previous" fill="var(--color-previous)" fillOpacity={0.35} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="current" fill="var(--color-current)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        ) : (
          <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-current)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--color-current)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {axes}
            {tooltip}
            <Line dataKey="previous" type="monotone" stroke="var(--color-previous)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Area dataKey="current" type="monotone" stroke="var(--color-current)" strokeWidth={2} fill={`url(#${gradient})`} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          </AreaChart>
        )}
      </ChartContainer>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-(--chart-1)" />Cette période</span>
        <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-(--chart-5)" />Période précédente</span>
      </figcaption>
    </figure>
  );
}

/** Actifs par jour, semaine ou mois : une seule courbe à la fois, choisie au-dessus. */
export function ActiveChart({ series, shift, bucket }: { series: Record<"dau" | "wau" | "mau", SeriesPoint[]>; shift: number; bucket: number }) {
  const [metric, setMetric] = useState<"dau" | "wau" | "mau">("dau");
  const labels = { dau: "Actifs du jour", wau: "Actifs sur 7 jours", mau: "Actifs sur 30 jours" } as const;
  return (
    <div className="grid gap-3">
      <ToggleGroup aria-label="Fenêtre" variant="outline" size="sm" value={[metric]} onValueChange={(v: string[]) => v[0] && setMetric(v[0] as typeof metric)}>
        <ToggleGroupItem value="dau">Jour</ToggleGroupItem>
        <ToggleGroupItem value="wau">Semaine</ToggleGroupItem>
        <ToggleGroupItem value="mau">Mois</ToggleGroupItem>
      </ToggleGroup>
      <TrendChart data={series[metric]} label={labels[metric]} shift={shift} bucket={bucket} />
    </div>
  );
}

export type BarRow = { label: string; n: number; prev?: number | null; href?: string; hint?: string; detail?: string };

/**
 * Classement en barres horizontales. La valeur et l'écart restent écrits ; l'infobulle ajoute la part du total,
 * la période précédente et le détail. Un lien mène au détail de la ligne.
 */
export function BarList({ rows, unit = "count", empty = "Rien sur cette période." }: { rows: BarRow[]; unit?: Unit; empty?: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.n));
  const total = rows.reduce((a, r) => a + r.n, 0);
  return (
    <ul className="grid gap-2.5">
      {rows.map((row, i) => {
        const c = row.prev === undefined ? null : compare(row.n, row.prev);
        return (
          <li key={`${i}-${row.label}`} className="grid min-w-0 gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                {row.href ? <Link className="underline-offset-2 hover:underline" href={row.href}>{row.label}</Link> : row.label}
                {row.hint && <span className="text-muted-foreground"> · {row.hint}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-2 tabular-nums">{c && <TrendBadge comparison={c} />}<span>{formatValue(row.n, unit)}</span></span>
            </div>
            <Tooltip>
              <TooltipTrigger render={<div tabIndex={0} aria-label={`${row.label} : ${formatValue(row.n, unit)}`} className="h-2 overflow-hidden rounded-full bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring" />}>
                <div className="h-full rounded-full bg-(--chart-1)" style={{ width: `${(row.n / max) * 100}%` }} />
              </TooltipTrigger>
              <TooltipContent className="grid gap-0.5 text-left">
                <span className="font-semibold">{row.label}</span>
                <span>{formatValue(row.n, unit)}{unit === "count" && total ? ` · ${percent(row.n / total)} du classement` : ""}</span>
                {c && c.previous !== null && <span>Période précédente : {formatValue(c.previous, unit)}{trendLabel(c) ? ` (${trendLabel(c)})` : ""}</span>}
                {row.detail && <span>{row.detail}</span>}
              </TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}
