import { alignSeries, bucketSeries, bucketSize, compare, type Period, type SeriesPoint, type StatsFilters } from "@/lib/audience-calc";

/** Ce que chaque vue des statistiques reçoit : filtres, période, et le lien vers une autre vue qui les garde. */
export type StatsContext = {
  f: StatsFilters;
  p: Period;
  bucket: number;
  href: (patch: Record<string, string | number | null>) => string;
};

export const contextOf = (f: StatsFilters, p: Period, href: StatsContext["href"]): StatsContext => ({ f, p, bucket: bucketSize(p.days), href });

/** Série quotidienne des deux périodes, regroupée par semaine sur 90 jours et plus. */
export const seriesOf = (ctx: StatsContext, rows: { day: string; n: number }[], mode: "sum" | "last" | "mean" = "sum"): SeriesPoint[] =>
  bucketSeries(alignSeries(rows, ctx.p), ctx.bucket, mode);

export const cmp = (pair: readonly [number | null, number | null]) => compare(pair[0], pair[1]);
