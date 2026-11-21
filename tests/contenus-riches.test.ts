import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CourseBody } from "@/components/course-body";
import { blocksToMarkdown, markdownToBlocks, sanitizeBlocks } from "@/lib/blocks";
import { contentSecurityPolicy } from "@/lib/csp";
import { compileExpression, parsePlot } from "@/lib/rich/plot";
import { sanitizeSvg } from "@/lib/rich/svg";
import { checkTikz } from "@/lib/rich/tikz";
import { checkVegaSpec, vegaSummary } from "@/lib/rich/vega";

const VEGA = JSON.stringify({ data: { values: [{ a: "A", b: 2 }] }, mark: "bar", encoding: { x: { field: "a", type: "nominal" }, y: { field: "b", type: "quantitative" } } });

describe("Sérialisation des blocs riches", () => {
  const blocks = [
    { type: "vegaLite", props: { source: VEGA } },
    { type: "tikz", props: { source: "\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}" } },
    { type: "plot", props: { source: "y = sin(x)\nx: -3 .. 3" } },
    { type: "svgFigure", props: { source: '<svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg>' } },
  ];
  it("chaque bloc devient un bloc de code de son langage, et revient à l'identique", () => {
    const markdown = blocksToMarkdown(sanitizeBlocks(blocks));
    for (const lang of ["```vega-lite", "```tikz", "```plot", "```svg-figure"]) expect(markdown).toContain(lang);
    expect(markdownToBlocks(markdown)).toEqual(blocks);
  });
  it("l'import Markdown reconnaît les mêmes blocs ; un autre langage reste du code", () => {
    expect(markdownToBlocks("```plot\ny = x\n```")).toEqual([{ type: "plot", props: { source: "y = x" } }]);
    expect(markdownToBlocks("```svg\n<svg/>\n```")[0].type).toBe("codeBlock");
  });
  it("le navigateur ne fait passer que la source, bornée", () => {
    const [clean] = sanitizeBlocks([{ type: "svgFigure", props: { source: "x".repeat(500_000), onload: "alert(1)" }, content: "<b>" }]);
    expect(Object.keys(clean.props!)).toEqual(["source"]);
    expect(String(clean.props!.source).length).toBe(400_000);
    expect(clean.content).toBeUndefined();
  });
});

describe("SVG nettoyé", () => {
  const clean = (source: string) => { const r = sanitizeSvg(source, "t"); if (!r.ok) throw new Error(r.error); return r.html; };
  it("retire scripts, gestionnaires d'événements et objets étrangers", () => {
    const html = clean(`<svg onload="alert(1)"><script>alert(2)</script><rect onclick="alert(3)" width="4"/><foreignObject><iframe src="https://x"></iframe></foreignObject><a href="javascript:alert(4)"><text>t</text></a></svg>`);
    expect(html).not.toMatch(/script|onload|onclick|foreignObject|iframe|javascript|alert/i);
    expect(html).toContain("<rect");
  });
  it("aucune ressource extérieure : liens, images, styles et url()", () => {
    const html = clean(`<svg><use href="https://evil.example/s.svg#a"/><image href="https://evil.example/p.png"/><rect fill="url(https://evil.example/x)" style="background:url(//evil.example/y)"/><style>@import url(https://evil.example/c.css);</style></svg>`);
    expect(html).not.toContain("evil.example");
    expect(html).not.toContain("<image");
  });
  it("garde les références internes, préfixées pour ne pas heurter la page", () => {
    const html = clean(`<svg><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect fill="url(#g)" width="5"/><use href="#g"/></svg>`);
    expect(html).toContain(`id="t-g"`);
    expect(html).toContain(`url(#t-g)`);
    expect(html).toContain(`href="#t-g"`);
  });
  it("refuse ce qui n'est pas un seul <svg>", () => {
    expect(sanitizeSvg("<div>texte</div>").ok).toBe(false);
    expect(sanitizeSvg("<svg></svg><svg></svg>").ok).toBe(false);
  });
  it("rendu dans le cours : éléments SVG, jamais de HTML brut", () => {
    const html = renderToString(createElement(CourseBody, { markdown: '```svg-figure\n<svg viewBox="0 0 4 4"><circle r="2" onmouseover="alert(1)"/><script>alert(1)</script></svg>\n```' }));
    expect(html).toContain("<circle");
    expect(html).not.toMatch(/alert|<script|onmouseover/);
  });
  it("une figure TikZ en cache est nettoyée avant d'entrer dans la page", () => {
    const source = "\\begin{tikzpicture}\\end{tikzpicture}";
    const html = renderToString(createElement(CourseBody, { markdown: "```tikz\n" + source + "\n```", rich: { tikz: new Map([[source, '<svg><text font-family="cmr10">x</text><script>alert(1)</script></svg>']]) } }));
    expect(html).toContain('font-family="cmr10"');
    expect(html).not.toContain("alert");
  });
});

describe("Vega-Lite sans données extérieures", () => {
  it("accepte une spécification aux données incluses", () => {
    const check = checkVegaSpec(VEGA);
    expect(check.ok).toBe(true);
    if (check.ok) expect(vegaSummary(check.spec)).toBe("Graphique (bar)");
  });
  it("refuse toute adresse, tout lien et les clés dangereuses", () => {
    expect(checkVegaSpec(JSON.stringify({ data: { url: "https://evil.example/d.csv" }, mark: "bar" })).ok).toBe(false);
    expect(checkVegaSpec(JSON.stringify({ layer: [{ data: { url: "data/cars.json" } }] })).ok).toBe(false);
    expect(checkVegaSpec(JSON.stringify({ mark: "point", encoding: { href: { field: "a" } } })).ok).toBe(false);
    expect(checkVegaSpec(JSON.stringify({ mark: { type: "image" }, data: { values: [{ img: "https://evil.example/i.png" }] } })).ok).toBe(false);
    expect(checkVegaSpec('{"__proto__": {"x": 1}, "mark": "bar"}').ok).toBe(false);
    expect(checkVegaSpec("pas du json").ok).toBe(false);
    expect(checkVegaSpec("[1, 2]").ok).toBe(false);
  });
  it("borne le nombre de lignes", () => {
    expect(checkVegaSpec(JSON.stringify({ data: { values: Array.from({ length: 6000 }, (_, i) => ({ i })) }, mark: "bar" })).ok).toBe(false);
  });
  it("rendu sans eval : interpréteur d'expressions, chargeur qui refuse tout, pas de menu d'export", () => {
    const code = readFileSync("src/components/rich/vega-chart.tsx", "utf8");
    expect(code).toContain("ast: true");
    expect(code).toContain("expressionInterpreter");
    expect(code).toContain("actions: false");
    expect(code).toMatch(/loader: \{ load: refuse/);
  });
});

describe("Graphe de fonctions sans eval", () => {
  it("calcule les fonctions usuelles", () => {
    expect(compileExpression("x^2")(3)).toBe(9);
    expect(compileExpression("2x + 1")(2)).toBe(5);
    expect(compileExpression("2^3^2")(0)).toBe(512);
    expect(compileExpression("-x^2")(2)).toBe(-4);
    expect(compileExpression("sin(pi/2)")(0)).toBeCloseTo(1);
    expect(compileExpression("max(x, 1)")(0)).toBe(1);
    expect(compileExpression("ln(x)")(-1)).toBeNaN();
  });
  it("refuse tout ce qui n'est pas une formule", () => {
    for (const bad of ["alert(1)", "constructor", "x.constructor", "this", "process.exit()", "[1]", "`x`", "x; y", "fetch('/')", "__proto__", "toString(x)"]) {
      expect(() => compileExpression(bad), bad).toThrow();
    }
  });
  it("lit le bloc : fonctions, intervalles, erreurs claires", () => {
    const parsed = parsePlot("y = sin(x)\nf(x) = x/2\nx: -3 .. 3\ny: -2 .. 2");
    expect(parsed.ok && parsed.spec.functions.length).toBe(2);
    expect(parsed.ok && parsed.spec.x).toEqual([-3, 3]);
    expect(parsePlot("x: 3 .. -3\ny = x").ok).toBe(false);
    expect(parsePlot("").ok).toBe(false);
    expect(parsePlot(Array(8).fill("y = x").join("\n")).ok).toBe(false);
  });
  it("le module n'utilise ni eval ni Function", () => {
    const code = readFileSync("src/lib/rich/plot.ts", "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(code).not.toMatch(/\beval\s*\(|new Function|Function\(/);
  });
});

describe("TikZ", () => {
  it("enveloppe la figure dans un document et garde le préambule", () => {
    const check = checkTikz("\\usetikzlibrary{arrows.meta}\n\\begin{tikzpicture}\\draw (0,0)--(1,0);\\end{tikzpicture}");
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.tex).toMatch(/^\\usetikzlibrary\{arrows\.meta\}\n\n\\begin\{document\}/);
  });
  it("refuse les commandes système, les fichiers et les paquets absents", () => {
    for (const bad of ["\\immediate\\write18{rm -rf /}\\begin{tikzpicture}\\end{tikzpicture}", "\\input{/etc/passwd}\\begin{tikzpicture}\\end{tikzpicture}", "\\usepackage{shellesc}\\begin{tikzpicture}\\end{tikzpicture}", "\\draw (0,0);", "x".repeat(30_000)]) {
      expect(checkTikz(bad).ok, bad.slice(0, 30)).toBe(false);
    }
  });
  it("le rendu tourne dans un fil coupé au bout de quelques secondes", () => {
    const code = readFileSync("src/lib/rich/tikz-server.ts", "utf8");
    expect(code).toContain("new Worker(");
    expect(code).toContain("worker.terminate()");
    expect(code).toContain("sanitizeSvg(");
  });
});

describe("CSP de la page inchangée", () => {
  it("ni 'unsafe-eval' ni 'wasm-unsafe-eval' pour les cours", () => {
    const csp = contentSecurityPolicy({ nonce: "n", dev: false, baseUrl: "https://campuss.fr" });
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("'nonce-n'");
  });
});
