"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { parsePlot, samplePath, type PlotSpec } from "@/lib/rich/plot";

// Mafs (MIT) n'est téléchargé que si un graphe est dans la page ; avant lui, et à l'impression, le tracé statique
const MafsPlot = dynamic(() => import("./mafs-plot"), { ssr: false, loading: () => null });
const STROKES = ["var(--chart-1, #2563eb)", "var(--chart-2, #dc2626)", "var(--chart-3, #16a34a)", "var(--chart-4, #7c3aed)", "var(--chart-5, #ea580c)", "#db2777"];

/** Tracé statique : lisible sans JavaScript, à l'impression et dans le PDF officiel. */
export function StaticPlot({ spec }: { spec: PlotSpec }) {
  const [x0, x1] = spec.x;
  const [y0, y1] = spec.y;
  const w = x1 - x0;
  const h = y1 - y0;
  return (
    <svg viewBox={`${x0} ${-y1} ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`Graphe de ${spec.functions.map((f) => f.label).join(", ")}`} className="h-80 w-full rounded-md border border-border bg-card">
      <line x1={x0} x2={x1} y1={0} y2={0} stroke="currentColor" strokeOpacity={0.4} vectorEffect="non-scaling-stroke" />
      <line x1={0} x2={0} y1={-y1} y2={-y0} stroke="currentColor" strokeOpacity={0.4} vectorEffect="non-scaling-stroke" />
      {spec.functions.map((f, i) => <path key={i} d={samplePath(f.fn, spec.x, spec.y)} fill="none" stroke={STROKES[i % STROKES.length]} strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
}

export function FunctionPlot({ source, interactive = true }: { source: string; interactive?: boolean }) {
  const parsed = useMemo(() => parsePlot(source), [source]);
  if (!parsed.ok) return <p role="alert" className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Graphe non affiché : {parsed.error}</p>;
  return (
    <figure className="course-rich">
      {interactive && <div className="overflow-hidden rounded-md border border-border print:hidden"><MafsPlot spec={parsed.spec} /></div>}
      <div className={interactive ? "hidden print:block" : undefined}><StaticPlot spec={parsed.spec} /></div>
      <figcaption>{parsed.spec.functions.map((f) => `y = ${f.label}`).join(" ; ")}</figcaption>
    </figure>
  );
}
