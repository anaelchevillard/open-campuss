"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { checkVegaSpec, vegaSummary } from "@/lib/rich/vega";

const refuse = () => Promise.reject(new Error("Aucune donnée extérieure"));

/**
 * Graphique Vega-Lite. vega-embed et vega-interpreter (BSD-3-Clause) ne sont téléchargés que si un
 * graphique est dans la page. Rendu SVG, expressions interprétées (option `ast`, aucun eval : la CSP de la page n'a pas
 * 'unsafe-eval'), chargeur qui refuse toute adresse, pas de menu d'export (il enverrait la spécification à un autre site).
 */
export function VegaChart({ source }: { source: string }) {
  const box = useRef<HTMLDivElement>(null);
  const check = useMemo(() => checkVegaSpec(source), [source]);
  const [error, setError] = useState<string | null>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (!check.ok || !box.current) return;
    let finalize: (() => void) | undefined;
    let live = true;
    void (async () => {
      try {
        const [{ default: embed }, { expressionInterpreter }] = await Promise.all([import("vega-embed"), import("vega-interpreter")]);
        if (!live || !box.current) return;
        const result = await embed(box.current, structuredClone(check.spec) as never, {
          mode: "vega-lite", renderer: "svg", actions: false, ast: true, expr: expressionInterpreter,
          loader: { load: refuse, sanitize: refuse, http: refuse, file: refuse } as never,
          config: { background: "transparent", font: "inherit", axis: { labelColor: "currentColor", titleColor: "currentColor" }, legend: { labelColor: "currentColor", titleColor: "currentColor" }, title: { color: "currentColor" } },
        });
        finalize = () => result.finalize();
        if (live) setDrawn(true);
      } catch (failure) {
        if (live) setError((failure as Error).message.slice(0, 200));
      }
    })();
    return () => { live = false; finalize?.(); };
  }, [check]);
  if (!check.ok) return <p role="alert" className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Graphique non affiché : {check.error}</p>;
  const summary = vegaSummary(check.spec);
  return (
    <figure className="course-rich" aria-label={summary}>
      <div ref={box} className="max-w-full overflow-x-auto" />
      {error && <p role="alert" className="text-sm text-muted-foreground">Graphique non affiché : {error}</p>}
      {!drawn && !error && <p className="text-sm text-muted-foreground">{summary}</p>}
    </figure>
  );
}
