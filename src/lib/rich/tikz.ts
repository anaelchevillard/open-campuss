/**
 * Figure TikZ, rendue en SVG par le moteur TeX de TikZJax (WebAssembly) côté serveur, dans un fil
 * à part, puis mise en cache. Ici, les règles pures : taille, commandes refusées, document TeX complet.
 *
 * Format du bloc (éditeur et Markdown, bloc de code « tikz », comme TikZJax et Obsidian) :
 *   \usetikzlibrary{arrows.meta}        (facultatif, avant la figure ; \usepackage{pgfplots} aussi)
 *   \begin{tikzpicture}
 *     \draw[->] (0,0) -- (2,1) node[right] {$v$};
 *   \end{tikzpicture}
 * Un document entier (\begin{document} … \end{document}) est aussi accepté.
 */
export const MAX_TIKZ_CHARS = 20_000;
// Le moteur tourne en mémoire, sans disque ni shell : ces commandes n'auraient aucun effet utile, on les refuse d'emblée
const FORBIDDEN = /\\(write18|immediate|openout|openin|read|input|include|InputIfFileExists|directlua|special|catcode|csname)\b/;
// Paquets livrés avec TikZJax ; tout autre \usepackage échouerait dans le moteur
const PACKAGES = new Set(["tikz", "pgfplots", "amsmath", "amssymb", "amsfonts", "tikz-cd", "circuitikz", "chemfig", "array", "xcolor", "tikz-3dplot", "pgfornament"]);
export const TIKZ_RENDER_VERSION = "1";

export type TikzCheck = { ok: true; tex: string } | { ok: false; error: string };

export function checkTikz(source: string): TikzCheck {
  const text = source.replace(/\r\n?/g, "\n").trim();
  if (!text) return { ok: false, error: "Écris une figure : \\begin{tikzpicture} … \\end{tikzpicture}." };
  if (text.length > MAX_TIKZ_CHARS) return { ok: false, error: "Figure trop longue (20 000 caractères au plus)." };
  const forbidden = FORBIDDEN.exec(text);
  if (forbidden) return { ok: false, error: `Commande refusée : \\${forbidden[1]}.` };
  for (const match of text.matchAll(/\\usepackage(?:\[[^\]]*\])?\{([^}]*)\}/g)) {
    for (const name of match[1].split(",").map((p) => p.trim())) if (!PACKAGES.has(name)) return { ok: false, error: `Paquet non disponible : ${name}.` };
  }
  if (!/\\begin\{(tikzpicture|tikzcd|circuitikz|axis)\}/.test(text)) return { ok: false, error: "La figure doit contenir \\begin{tikzpicture} … \\end{tikzpicture}." };
  if (/\\begin\{document\}/.test(text)) return { ok: true, tex: text };
  // Préambule (\usepackage, \usetikzlibrary) avant la figure, puis le document
  const start = text.search(/\\begin\{/);
  return { ok: true, tex: `${text.slice(0, start)}\n\\begin{document}\n${text.slice(start)}\n\\end{document}\n` };
}
