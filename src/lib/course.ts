import type { Root, RootContent } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { artifactRef } from "./rich/artifact";

export const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkDirective);
export const writer = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkDirective).use(remarkStringify, { bullet: "-", emphasis: "*", strong: "*", fences: true });

// Médias admis dans un texte : fichiers d'un cours, ou images publiques d'une actualité
export const COURSE_IMAGE = /^\/(files\/[0-9a-f-]{36}(\?inline=1)?|actualites\/images\/[0-9a-f-]{36})$/;
export const COLORS = ["gray", "brown", "red", "orange", "yellow", "green", "blue", "purple", "pink"] as const;
export const YOUTUBE_ID = /^[\w-]{6,20}$/;
type Directive = { type: string; name: string; attributes?: Record<string, string | null | undefined> | null; children: RootContent[] };
const isDirective = (node: { type: string }) => node.type === "textDirective" || node.type === "leafDirective" || node.type === "containerDirective";

/** Seules ces extensions du Markdown existent ; toute autre redevient du texte (« a:b » n'est pas une commande). */
export function directiveAllowed(node: Directive) {
  const a = node.attributes ?? {};
  if (node.type === "textDirective") return node.name === "u" || ((node.name === "hl" || node.name === "c") && (COLORS as readonly string[]).includes(a.c ?? ""));
  if (node.type === "leafDirective") {
    if (node.name === "youtube") return YOUTUBE_ID.test(a.v ?? "");
    // Artefact HTML d'un cours, rendu dans un cadre isolé de l'origine de contenu
    if (node.name === "artifact") return artifactRef(a) !== null;
    return ["video", "audio", "file"].includes(node.name) && COURSE_IMAGE.test(a.src ?? "");
  }
  return node.type === "containerDirective" && (node.name === "toggle" || node.name === "indent");
}

export function restoreUnknownDirectives(tree: Root) {
  visit(tree, (node, index, parent) => {
    if (!isDirective(node) || !parent || index === undefined || directiveAllowed(node as unknown as Directive)) return;
    const d = node as unknown as Directive;
    const prefix = d.type === "textDirective" ? ":" : d.type === "leafDirective" ? "::" : ":::";
    const siblings = parent.children as RootContent[];
    const label = { type: "text", value: `${prefix}${d.name}` } as RootContent;
    // Au niveau d'un bloc, le texte a besoin de son paragraphe
    if (d.type === "textDirective") siblings.splice(index, 1, label, ...d.children);
    else siblings.splice(index, 1, { type: "paragraph", children: [label] } as RootContent, ...d.children);
    return index;
  });
}
const SAFE_LINK = /^(https?:|mailto:|#)/i;
export const MAX_COURSE_CHARS = 2_000_000;

const CALLOUTS: [RegExp, string][] = [
  [/^d[ée]finition\b/i, "definition"], [/^(th[ée]or[èe]me|propri[ée]t[ée]|loi)\b/i, "theoreme"],
  [/^(attention|erreur)\b/i, "attention"], [/^([àa] retenir|r[ée]sum[ée])\b/i, "retenir"], [/^exemple\b/i, "exemple"],
];

export function calloutKind(firstText: string) {
  return CALLOUTS.find(([pattern]) => pattern.test(firstText.trim()))?.[1];
}

function normalizeTree(tree: Root) {
  restoreUnknownDirectives(tree);
  visit(tree, (node, index, parent) => {
    // Même structure pour tous : le titre du document est le seul niveau 1, et on s'arrête au niveau 3
    if (node.type === "heading") node.depth = node.depth <= 2 ? 2 : 3;
    if (!parent || index === undefined) return;
    const children = parent.children as RootContent[];
    // Le HTML, les images et les liens extérieurs au cadre sont retirés avant tout enregistrement
    if (node.type === "html" || node.type === "definition" || node.type === "imageReference" || node.type === "linkReference") {
      children.splice(index, 1);
      return index;
    }
    if (node.type === "image" && !COURSE_IMAGE.test(node.url)) {
      children.splice(index, 1);
      return index;
    }
    if (node.type === "link" && !SAFE_LINK.test(node.url.replace(/[\x00-\x20]+/g, ""))) {
      children.splice(index, 1, ...node.children);
      return index;
    }
  });
}

/** Tout texte de cours, écrit à la main ou issu de l'IA, passe ici avant d'être enregistré. */
export function normalizeCourse(markdown: string) {
  const tree = parser.parse(markdown.slice(0, MAX_COURSE_CHARS)) as Root;
  normalizeTree(tree);
  return String(writer.stringify(tree));
}

export function normalizeTreeToMarkdown(tree: Root) {
  normalizeTree(tree);
  return String(writer.stringify(tree));
}

/** Pour le rendu : chaque extension devient un seul élément HTML connu, sans jamais passer de HTML brut. */
export function remarkCampuss() {
  return (tree: Root) => {
    restoreUnknownDirectives(tree);
    visit(tree, (node) => {
      if (!isDirective(node)) return;
      const d = node as unknown as Directive & { data?: Record<string, unknown> };
      const a = d.attributes ?? {};
      if (d.name === "u") d.data = { hName: "u" };
      else if (d.name === "hl") d.data = { hName: "mark", hProperties: { className: [`hl-${a.c}`] } };
      else if (d.name === "c") d.data = { hName: "span", hProperties: { className: [`tc-${a.c}`] } };
      else if (d.name === "video") d.data = { hName: "video", hProperties: { src: a.src, controls: true, preload: "metadata" } };
      else if (d.name === "audio") d.data = { hName: "audio", hProperties: { src: a.src, controls: true, preload: "metadata" } };
      else if (d.name === "file") { d.data = { hName: "a", hProperties: { href: (a.src ?? "").replace("?inline=1", ""), className: ["course-file"] } }; d.children = [{ type: "text", value: a.name || "Fichier joint" } as RootContent]; }
      else if (d.name === "artifact") {
        // Un seul élément connu, lu par CourseBody : jamais de HTML de l'artefact dans la page
        const ref = artifactRef(a)!;
        d.data = { hName: "figure", hProperties: { className: ["course-artifact"], dataArtifactFile: ref.fileId, dataArtifactEntry: ref.entry, dataArtifactDisplay: ref.display, title: ref.title } };
        d.children = [];
      }
      else if (d.name === "youtube") d.data = { hName: "iframe", hProperties: { src: `https://www.youtube-nocookie.com/embed/${a.v}`, title: "Vidéo YouTube", allowFullScreen: true, loading: "lazy", referrerPolicy: "strict-origin-when-cross-origin", sandbox: "allow-scripts allow-same-origin allow-presentation" } };
      // Blocs décalés d'une tabulation dans l'éditeur : retrait et filet, comme à l'écriture
      else if (d.name === "indent") d.data = { hName: "div", hProperties: { className: ["course-indent"] } };
      else if (d.name === "toggle") {
        d.data = { hName: "details" };
        const label = d.children[0] as unknown as { data?: Record<string, unknown> } | undefined;
        if (label?.data?.directiveLabel) label.data = { ...label.data, hName: "summary" };
      }
    });
  };
}

export const courseText = (markdown: string) => toString(parser.parse(markdown)).slice(0, 200_000);

export function slugify(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
}

/** Sommaire automatique : les mêmes ancres que dans le rendu, doublons numérotés. */
export function courseOutline(markdown: string) {
  const seen = new Map<string, number>();
  const items: { id: string; text: string; depth: number }[] = [];
  visit(parser.parse(markdown) as Root, "heading", (node) => {
    const text = toString(node);
    if (!text.trim()) return;
    items.push({ id: uniqueSlug(seen, text), text, depth: node.depth });
  });
  return items;
}

export function uniqueSlug(seen: Map<string, number>, text: string) {
  const base = slugify(text);
  const n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}
