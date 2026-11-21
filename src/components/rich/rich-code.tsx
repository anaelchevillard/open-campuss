import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { FunctionPlot } from "@/components/rich/function-plot";
import { TikzFigure } from "@/components/rich/tikz-figure";
import { VegaChart } from "@/components/rich/vega-chart";
import { sanitizeSvg } from "@/lib/rich/svg";
import { RICH_LANGUAGES, type RichLanguage } from "@/lib/rich/languages";

export { RICH_LANGUAGES, type RichLanguage };

// Préfixe des identifiants d'un SVG : stable pour une même source (FNV-1a), différent d'une figure à l'autre
const prefixOf = (source: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 0x01000193);
  return `s${(hash >>> 0).toString(36)}`;
};

/** Un SVG nettoyé, rendu en éléments React (jamais de HTML brut injecté dans la page). */
function SafeSvg({ source, label }: { source: string; label: string }) {
  const clean = sanitizeSvg(source, prefixOf(source));
  if (!clean.ok) return <p role="alert" className="rounded-md bg-muted p-3 text-sm text-muted-foreground">{label} non affichée : {clean.error}</p>;
  return <div className="rich-svg">{toJsxRuntime(clean.tree, { Fragment, jsx, jsxs, space: "svg", stylePropertyNameCase: "dom" })}</div>;
}

/**
 * Les blocs de code « vega-lite », « tikz », « plot » et « svg-figure » d'un cours deviennent des
 * figures. Les graphiques et graphes se dessinent dans le navigateur (bibliothèques chargées à la demande) ; les SVG et
 * les figures TikZ déjà calculées sont rendus ici, nettoyés.
 */
export function RichCode({ lang, source, tikz }: { lang: RichLanguage; source: string; tikz?: Map<string, string> }) {
  if (lang === "svg-figure") return <figure className="course-rich"><SafeSvg source={source} label="Figure SVG" /></figure>;
  if (lang === "vega-lite") return <VegaChart source={source} />;
  if (lang === "plot") return <FunctionPlot source={source} />;
  const cached = tikz?.get(source);
  if (cached) return <figure className="course-rich">{/* eslint-disable-next-line @next/next/no-css-tags */}<link rel="stylesheet" href="/vendor/tikz/fonts.css" precedence="default" /><SafeSvg source={cached} label="Figure TikZ" /></figure>;
  return <TikzFigure source={source} />;
}
