"use client";

import { useEffect, useState } from "react";
import { FunctionPlot } from "@/components/rich/function-plot";
import { TikzFigure } from "@/components/rich/tikz-figure";
import { VegaChart } from "@/components/rich/vega-chart";
import type { RichLanguage } from "@/lib/rich/languages";
import { svgDataUrl } from "@/lib/rich/svg-preview";

/** Ce que l'éditeur propose pour chaque bloc riche : titre, aide et exemple de départ. */
export const RICH_EDITORS: Record<RichLanguage, { title: string; hint: string; example: string }> = {
  "vega-lite": {
    title: "Graphique (Vega-Lite)", hint: "Spécification JSON Vega-Lite ; les données vont dans « values » (aucune adresse).",
    example: `{\n  "data": { "values": [{ "mois": "Sept.", "inscrits": 120 }, { "mois": "Oct.", "inscrits": 180 }, { "mois": "Nov.", "inscrits": 240 }] },\n  "mark": "bar",\n  "encoding": {\n    "x": { "field": "mois", "type": "nominal", "sort": null },\n    "y": { "field": "inscrits", "type": "quantitative" }\n  }\n}`,
  },
  tikz: {
    title: "Figure TikZ", hint: "Code TikZ (comme TikZJax) : \\usetikzlibrary{…} puis \\begin{tikzpicture} … \\end{tikzpicture}.",
    example: "\\begin{tikzpicture}\n  \\draw[->] (-2,0) -- (2,0) node[right] {$x$};\n  \\draw[->] (0,-1) -- (0,2) node[above] {$y$};\n  \\draw[thick, blue] (-1.5,1.5) parabola bend (0,0) (1.5,1.5);\n\\end{tikzpicture}",
  },
  plot: {
    title: "Graphe de fonctions", hint: "Une fonction par ligne (y = …), puis x: a .. b et y: c .. d. Fonctions : sin, cos, exp, ln, sqrt, abs…",
    example: "y = sin(x)\ny = x^2/4 - 1\nx: -6 .. 6\ny: -3 .. 3",
  },
  "svg-figure": {
    title: "Figure SVG", hint: "Code d’un seul <svg> ; scripts, liens et ressources extérieures sont retirés à la publication.",
    example: `<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">\n  <rect x="10" y="10" width="80" height="80" rx="8" fill="#2563eb"/>\n  <circle cx="150" cy="50" r="40" fill="#f97316"/>\n</svg>`,
  },
};

function Preview({ lang, source }: { lang: RichLanguage; source: string }) {
  if (!source.trim()) return <p className="text-sm text-muted-foreground">Aperçu vide.</p>;
  if (lang === "vega-lite") return <VegaChart source={source} />;
  if (lang === "plot") return <FunctionPlot source={source} />;
  if (lang === "tikz") return <TikzFigure source={source} preview />;
  // Un SVG en image n'exécute rien et ne charge rien : l'aperçu n'a pas besoin du nettoyage du serveur
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={svgDataUrl(source)} alt="Aperçu de la figure SVG" className="mx-auto max-h-96 max-w-full" />;
}

/** Bloc riche dans l'éditeur : le code à gauche (ou au-dessus), l'aperçu calculé après une courte pause de frappe. */
export function RichBlock({ lang, source, onChange }: { lang: RichLanguage; source: string; onChange: (source: string) => void }) {
  const meta = RICH_EDITORS[lang];
  const [draft, setDraft] = useState(source || meta.example);
  const [shown, setShown] = useState(draft);
  const [editing, setEditing] = useState(!source);
  useEffect(() => { if (!source) onChange(meta.example); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const timer = setTimeout(() => setShown(draft), 500);
    return () => clearTimeout(timer);
  }, [draft]);
  return (
    <div contentEditable={false} className="grid w-full gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm font-semibold">{meta.title}</p>
        <button type="button" onClick={() => setEditing(!editing)} className="h-8 rounded-md border border-input px-2.5 text-sm font-semibold hover:bg-muted">{editing ? "Terminer" : "Modifier"}</button>
      </div>
      {editing && (
        <>
          <textarea aria-label={`Code : ${meta.title}`} value={draft} spellCheck={false} rows={8}
            onChange={(event) => { setDraft(event.target.value); onChange(event.target.value); }}
            className="min-h-32 rounded-md border border-input bg-card p-2 font-mono text-[0.8rem]" />
          <p className="text-xs text-muted-foreground">{meta.hint}</p>
        </>
      )}
      <Preview lang={lang} source={shown} />
    </div>
  );
}
