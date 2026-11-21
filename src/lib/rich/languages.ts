/** Les blocs de code qui deviennent des figures, dans l'éditeur, l'import Markdown et la lecture. */
export const RICH_LANGUAGES = ["vega-lite", "tikz", "plot", "svg-figure"] as const;
export type RichLanguage = (typeof RICH_LANGUAGES)[number];
export const isRichLanguage = (value: unknown): value is RichLanguage => typeof value === "string" && (RICH_LANGUAGES as readonly string[]).includes(value);
/** Le type de bloc de l'éditeur pour chaque langage, et l'inverse. */
export const RICH_BLOCKS: Record<RichLanguage, string> = { "vega-lite": "vegaLite", tikz: "tikz", plot: "plot", "svg-figure": "svgFigure" };
export const RICH_LANGUAGE_OF: Record<string, RichLanguage> = Object.fromEntries(Object.entries(RICH_BLOCKS).map(([lang, type]) => [type, lang as RichLanguage]));
export const MAX_RICH_SOURCE = 400_000;
