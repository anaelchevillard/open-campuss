import type { Element, ElementContent, Root } from "hast";
import { fromHtml } from "hast-util-from-html";
import { toHtml } from "hast-util-to-html";

/**
 * Nettoyage d'un SVG avant de l'afficher en ligne dans la page (équivalent serveur de DOMPurify,
 * par liste blanche sur l'arbre hast : rien n'est exécuté pendant l'analyse). Aucun script, aucun gestionnaire
 * d'événement, aucun objet étranger (foreignObject, iframe), aucune ressource extérieure : les liens ne visent qu'un
 * identifiant du même SVG (« #a »), les styles ne chargent rien (url() seulement vers « #a », pas d'@import).
 * Les identifiants reçoivent un préfixe propre au SVG, pour ne jamais entrer en collision avec la page.
 */
export const MAX_SVG_CHARS = 400_000;
const MAX_NODES = 20_000;

const ELEMENTS = new Set([
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "textPath", "title", "desc",
  "defs", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "marker", "pattern", "symbol", "use", "style",
]);

// Attributs de géométrie, de présentation et de texte ; tout le reste (on*, href externe, xml:base…) disparaît
const ATTRIBUTES = new Set([
  "id", "className", "viewBox", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "d", "points",
  "transform", "fill", "fillOpacity", "fillRule", "stroke", "strokeWidth", "strokeOpacity", "strokeLinecap", "strokeLinejoin",
  "strokeDasharray", "strokeDashoffset", "strokeMiterlimit", "opacity", "color", "display", "visibility", "clipPath", "clipRule",
  "mask", "markerStart", "markerMid", "markerEnd", "fontFamily", "fontSize", "fontWeight", "fontStyle", "textAnchor",
  "dominantBaseline", "alignmentBaseline", "baselineShift", "letterSpacing", "wordSpacing", "textDecoration", "dx", "dy", "rotate",
  "lengthAdjust", "textLength", "offset", "stopColor", "stopOpacity", "gradientUnits", "gradientTransform", "spreadMethod", "fx", "fy",
  "fr", "patternUnits", "patternContentUnits", "patternTransform", "markerWidth", "markerHeight", "markerUnits", "refX", "refY",
  "orient", "preserveAspectRatio", "clipPathUnits", "maskUnits", "maskContentUnits", "vectorEffect", "paintOrder", "shapeRendering",
  "textRendering", "xmlns", "xmlnsXLink", "version", "role", "ariaLabel", "ariaHidden", "style", "href", "xLinkHref", "startOffset",
]);

const LOCAL_REF = /^#[\w.:-]{1,200}$/;
// url(#a) seulement ; tout autre url(), @import, expression(), javascript:, ou un échappement CSS est refusé
const DANGEROUS_CSS = /url\s*\(\s*(?!['"]?#)|@import|expression\s*\(|javascript:|behavior\s*:|-moz-binding|\\/i;
const URL_VALUE = /url\s*\(\s*['"]?#([\w.:-]+)['"]?\s*\)/g;

export type SvgResult = { ok: true; tree: Root; html: string } | { ok: false; error: string };

function cleanStyle(value: string) {
  return DANGEROUS_CSS.test(value) ? null : value.slice(0, 5000);
}

/** Nettoie le SVG ; `prefix` rend ses identifiants uniques dans la page (par exemple un hachage de la source). */
export function sanitizeSvg(source: string, prefix = "s"): SvgResult {
  if (source.length > MAX_SVG_CHARS) return { ok: false, error: "SVG trop lourd (400 000 caractères au plus)." };
  const tree = fromHtml(source, { fragment: true }) as Root;
  const roots = tree.children.filter((n): n is Element => n.type === "element");
  if (roots.length !== 1 || roots[0].tagName !== "svg") return { ok: false, error: "Le bloc doit contenir un seul élément <svg>." };
  const id = (raw: string) => `${prefix.replace(/[^\w-]/g, "")}-${raw}`;
  let nodes = 0;

  const walk = (element: Element): Element | null => {
    if (++nodes > MAX_NODES || !ELEMENTS.has(element.tagName)) return null;
    const properties: Element["properties"] = {};
    for (const [key, raw] of Object.entries(element.properties ?? {})) {
      if (!ATTRIBUTES.has(key) || raw === null || raw === undefined) continue;
      const value = Array.isArray(raw) ? raw.join(" ") : String(raw);
      if (/^on/i.test(key)) continue;
      if (key === "href" || key === "xLinkHref") { if (LOCAL_REF.test(value)) properties.href = `#${id(value.slice(1))}`; continue; }
      if (key === "id") { properties.id = id(value.slice(0, 200)); continue; }
      if (key === "style") { const style = cleanStyle(value); if (style !== null) properties.style = style.replace(URL_VALUE, (_, ref) => `url(#${id(ref)})`); continue; }
      if (/javascript:|data:/i.test(value)) continue;
      properties[key] = typeof raw === "string" && /url\(/i.test(value) ? (DANGEROUS_CSS.test(value) ? undefined : value.replace(URL_VALUE, (_, ref) => `url(#${id(ref)})`)) : raw;
    }
    let children: ElementContent[];
    if (element.tagName === "style") {
      // Feuille de style interne (fréquente dans les exports d'Inkscape ou d'Illustrator) : texte seul, sans chargement
      const css = element.children.map((c) => (c.type === "text" ? c.value : "")).join("");
      if (DANGEROUS_CSS.test(css) || /<\//.test(css)) return null;
      children = [{ type: "text", value: css.replace(URL_VALUE, (_, ref) => `url(#${id(ref)})`).replace(/#([A-Za-z_][\w-]*)/g, (match, ref) => (/^[0-9a-f]{3,8}$/i.test(ref) ? match : `#${id(ref)}`)) }];
    } else {
      children = element.children.flatMap((child): ElementContent[] => {
        if (child.type === "text") return [child];
        if (child.type !== "element") return [];
        const clean = walk(child);
        return clean ? [clean] : [];
      });
    }
    return { type: "element", tagName: element.tagName, properties, children };
  };

  const svg = walk(roots[0]);
  if (!svg) return { ok: false, error: "Ce SVG est trop complexe." };
  if (nodes > MAX_NODES) return { ok: false, error: "Ce SVG est trop complexe." };
  const clean: Root = { type: "root", children: [svg] };
  return { ok: true, tree: clean, html: toHtml(clean, { space: "svg" }) };
}
