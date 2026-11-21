import type { Root, RootContent, PhrasingContent, TableRow, ListItem } from "mdast";
import { toString } from "mdast-util-to-string";
import { COLORS, COURSE_IMAGE, normalizeTreeToMarkdown, parser, restoreUnknownDirectives, YOUTUBE_ID } from "./course";
import { artifactAttributes, artifactRef } from "./rich/artifact";
import { isRichLanguage, MAX_RICH_SOURCE, RICH_BLOCKS, RICH_LANGUAGE_OF } from "./rich/languages";

/** Le format des blocs de l'éditeur, réduit à ce que Campuss sait publier. Rien ici ne dépend du navigateur. */
export type Block = { id?: string; type: string; props?: Record<string, unknown>; content?: unknown; children?: Block[] };
type Inline = { type: string; text?: string; styles?: Record<string, unknown>; href?: string; content?: unknown };

export const CALLOUT_KINDS = { definition: "Définition", theoreme: "Théorème", attention: "Attention", retenir: "À retenir", exemple: "Exemple" } as const;
export type CalloutKind = keyof typeof CALLOUT_KINDS;

const SAFE_LINK = /^(https?:|mailto:|#)/i;
const FILE_URL = /^\/(files|revision-files|actualites\/images)\/[0-9a-f-]{36}(\?inline=1)?$/;
const BLOCK_TYPES = new Set(["paragraph", "heading", "quote", "callout", "bulletListItem", "numberedListItem", "checkListItem", "toggleListItem", "codeBlock", "table", "image", "video", "audio", "file", "divider", "mathBlock", "youtube", "artifact", ...Object.values(RICH_BLOCKS)]);
const MEDIA_BLOCKS = new Set(["image", "video", "audio", "file"]);
const isColor = (value: unknown): value is string => typeof value === "string" && (COLORS as readonly string[]).includes(value);
const directive = (type: string, name: string, attributes: Record<string, string>, children: unknown[] = []) => ({ type, name, attributes, children }) as unknown as RootContent;

export function youtubeId(url: string) {
  const match = url.trim().match(/^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,20})/);
  return match?.[1] ?? "";
}

/** Un média dont le fichier n'est pas sur Campuss : la politique du site le bloquerait, et il ne serait pas publié. */
export function hasForeignMedia(block: Pick<Block, "type" | "props">) {
  const url = String(block.props?.url ?? "");
  return MEDIA_BLOCKS.has(block.type) && url !== "" && !FILE_URL.test(url);
}

// --- Des blocs vers le Markdown Campuss

function inlineList(content: unknown): Inline[] {
  if (typeof content === "string") return [{ type: "text", text: content, styles: {} }];
  return Array.isArray(content) ? content as Inline[] : [];
}

function styled(value: string, styles: Record<string, unknown>): PhrasingContent[] {
  if (!value) return [];
  if (styles.code) return [{ type: "inlineCode", value }];
  let node: PhrasingContent = { type: "text", value };
  if (styles.strike) node = { type: "delete", children: [node] };
  if (styles.italic) node = { type: "emphasis", children: [node] };
  if (styles.bold) node = { type: "strong", children: [node] };
  if (styles.underline) node = directive("textDirective", "u", {}, [node]) as PhrasingContent;
  if (isColor(styles.textColor)) node = directive("textDirective", "c", { c: styles.textColor }, [node]) as PhrasingContent;
  if (isColor(styles.backgroundColor)) node = directive("textDirective", "hl", { c: styles.backgroundColor }, [node]) as PhrasingContent;
  return [node];
}

function toPhrasing(content: unknown): PhrasingContent[] {
  return inlineList(content).flatMap((item): PhrasingContent[] => {
    if (item.type === "link") return SAFE_LINK.test((item.href ?? "").replace(/[\x00-\x20]+/g, "")) ? [{ type: "link", url: item.href!, children: toPhrasing(item.content) }] : toPhrasing(item.content);
    if (item.type === "math") return [{ type: "inlineMath", value: typeof item.content === "string" ? item.content : inlineList(item.content).map((i) => i.text ?? "").join("") } as unknown as PhrasingContent];
    return item.type === "text" ? styled(item.text ?? "", item.styles ?? {}) : [];
  });
}

function blockPhrasing(block: Block): PhrasingContent[] {
  let nodes = toPhrasing(block.content);
  const props = block.props ?? {};
  if (nodes.length && isColor(props.textColor)) nodes = [directive("textDirective", "c", { c: props.textColor }, nodes) as PhrasingContent];
  if (nodes.length && isColor(props.backgroundColor)) nodes = [directive("textDirective", "hl", { c: props.backgroundColor }, nodes) as PhrasingContent];
  return nodes;
}

const plainText = (content: unknown) => inlineList(content).map((i) => i.text ?? "").join("");
const paragraph = (children: PhrasingContent[]): RootContent => ({ type: "paragraph", children });

function tableNode(block: Block): RootContent[] {
  const rows = (block.content as { rows?: { cells?: unknown[] }[] } | undefined)?.rows ?? [];
  if (!rows.length) return [];
  return [{ type: "table", align: null, children: rows.map((row): TableRow => ({ type: "tableRow", children: (row.cells ?? []).map((cell) => ({
    type: "tableCell", children: toPhrasing(Array.isArray(cell) ? cell : (cell as { content?: unknown }).content),
  })) })) }];
}

function blockNodes(blocks: Block[]): RootContent[] {
  const out: RootContent[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const props = block.props ?? {};
    const url = String(props.url ?? "");
    // Les enfants d'un bloc (touche Tab dans l'éditeur) restent décalés à la lecture
    const inner = () => blockNodes(block.children ?? []);
    const nested = () => (block.children?.length ? [directive("containerDirective", "indent", {}, blockNodes(block.children))] : []);
    switch (block.type) {
      case "bulletListItem": case "numberedListItem": case "checkListItem": {
        const type = block.type;
        const items: ListItem[] = [];
        for (; i < blocks.length && blocks[i].type === type; i++) {
          const b = blocks[i];
          items.push({ type: "listItem", spread: false, checked: type === "checkListItem" ? Boolean(b.props?.checked) : null, children: [paragraph(blockPhrasing(b)), ...blockNodes(b.children ?? [])] as ListItem["children"] });
        }
        i--;
        out.push({ type: "list", ordered: type === "numberedListItem", spread: false, children: items });
        break;
      }
      case "heading": out.push({ type: "heading", depth: Number(props.level) >= 3 ? 3 : 2, children: blockPhrasing(block) }, ...nested()); break;
      case "quote": out.push({ type: "blockquote", children: [paragraph(blockPhrasing(block)), ...inner()] as never }); break;
      case "callout": {
        const label = CALLOUT_KINDS[props.kind as CalloutKind] ?? CALLOUT_KINDS.definition;
        out.push({ type: "blockquote", children: [paragraph([{ type: "strong", children: [{ type: "text", value: `${label} :` }] }, { type: "text", value: " " }, ...blockPhrasing(block)]), ...inner()] as never });
        break;
      }
      case "toggleListItem": out.push(directive("containerDirective", "toggle", {}, [{ type: "paragraph", data: { directiveLabel: true }, children: blockPhrasing(block) }, ...inner()])); break;
      case "codeBlock": out.push({ type: "code", lang: typeof props.language === "string" && props.language !== "text" ? props.language : null, value: plainText(block.content) }); break;
      case "mathBlock": out.push({ type: "math", value: plainText(block.content) } as unknown as RootContent); break;
      case "divider": out.push({ type: "thematicBreak" }); break;
      case "table": out.push(...tableNode(block)); break;
      case "image": if (COURSE_IMAGE.test(url)) out.push(paragraph([{ type: "image", url, alt: String(props.caption ?? props.name ?? "") }])); break;
      case "video": case "audio": if (COURSE_IMAGE.test(url)) out.push(directive("leafDirective", block.type, { src: url })); break;
      case "file": if (COURSE_IMAGE.test(url)) out.push(directive("leafDirective", "file", { src: url, name: String(props.name ?? "Fichier joint").slice(0, 200) })); break;
      case "youtube": { const id = youtubeId(url); if (id) out.push(directive("leafDirective", "youtube", { v: id })); break; }
      // Graphique, figure TikZ, graphe de fonctions, SVG = un bloc de code de ce langage
      case "vegaLite": case "tikz": case "plot": case "svgFigure": { const source = String(props.source ?? ""); if (source.trim()) out.push({ type: "code", lang: RICH_LANGUAGE_OF[block.type], value: source }); break; }
      case "artifact": { const ref = artifactRef(props); if (ref) out.push(directive("leafDirective", "artifact", artifactAttributes(ref))); break; }
      default: { const nodes = blockPhrasing(block); if (nodes.length) out.push(paragraph(nodes)); out.push(...nested()); }
    }
  }
  return out;
}

/** Le serveur déduit lui-même le Markdown publié : celui du navigateur n'est jamais cru. */
export function blocksToMarkdown(blocks: Block[]) {
  return normalizeTreeToMarkdown({ type: "root", children: blockNodes(blocks) });
}

export const blocksToTree = (blocks: Block[]): Root => ({ type: "root", children: blockNodes(blocks) });

// --- Du Markdown vers les blocs

function inlineFrom(nodes: PhrasingContent[], styles: Record<string, unknown> = {}): Inline[] {
  return nodes.flatMap((node): Inline[] => {
    const any = node as unknown as { type: string; value?: string; url?: string; name?: string; attributes?: Record<string, string>; children?: PhrasingContent[] };
    switch (any.type) {
      case "text": return [{ type: "text", text: any.value ?? "", styles }];
      case "inlineCode": return [{ type: "text", text: any.value ?? "", styles: { ...styles, code: true } }];
      case "break": return [{ type: "text", text: "\n", styles }];
      case "strong": return inlineFrom(any.children ?? [], { ...styles, bold: true });
      case "emphasis": return inlineFrom(any.children ?? [], { ...styles, italic: true });
      case "delete": return inlineFrom(any.children ?? [], { ...styles, strike: true });
      case "link": return [{ type: "link", href: any.url ?? "", content: inlineFrom(any.children ?? [], styles) }];
      case "inlineMath": return [{ type: "math", content: any.value ?? "" }];
      case "textDirective": {
        if (any.name === "u") return inlineFrom(any.children ?? [], { ...styles, underline: true });
        if (any.name === "hl") return inlineFrom(any.children ?? [], { ...styles, backgroundColor: any.attributes?.c });
        if (any.name === "c") return inlineFrom(any.children ?? [], { ...styles, textColor: any.attributes?.c });
        return inlineFrom(any.children ?? [], styles);
      }
      default: return any.children ? inlineFrom(any.children, styles) : [];
    }
  });
}

const textBlock = (type: string, content: Inline[], props: Record<string, unknown> = {}, children: Block[] = []): Block => ({ type, props, content, children });

function paragraphBlocks(children: PhrasingContent[]): Block[] {
  // Une image est un bloc à part entière, même écrite au milieu d'un paragraphe
  const out: Block[] = [];
  let run: PhrasingContent[] = [];
  const flush = () => { if (run.some((n) => n.type !== "text" || n.value.trim())) out.push(textBlock("paragraph", inlineFrom(run))); run = []; };
  for (const node of children) {
    if (node.type === "image") { flush(); if (FILE_URL.test(node.url)) out.push({ type: "image", props: { url: node.url, caption: node.alt ?? "" } }); } else run.push(node);
  }
  flush();
  return out;
}

function calloutOf(children: RootContent[]): { kind: CalloutKind; rest: PhrasingContent[] } | null {
  const first = children[0];
  if (first?.type !== "paragraph") return null;
  const head = toString(first.children[0] ?? "").trim().replace(/\s*:$/, "").toLowerCase();
  const entry = (Object.entries(CALLOUT_KINDS) as [CalloutKind, string][]).find(([, label]) => label.toLowerCase() === head);
  if (!entry || first.children[0].type !== "strong") return null;
  const rest = first.children.slice(1);
  if (rest[0]?.type === "text") rest[0] = { ...rest[0], value: rest[0].value.replace(/^\s+/, "") };
  return { kind: entry[0], rest };
}

function nodesToBlocks(nodes: RootContent[]): Block[] {
  const out: Block[] = [];
  for (const node of nodes) {
    const any = node as unknown as { type: string; name?: string; children?: RootContent[] };
    // Un retrait redevient les enfants du bloc qui le précède
    if (any.type === "containerDirective" && any.name === "indent") {
      const children = nodesToBlocks(any.children ?? []);
      const previous = out.at(-1);
      if (previous && previous.type !== "divider" && previous.type !== "table") out[out.length - 1] = { ...previous, children: [...(previous.children ?? []), ...children] };
      else out.push(...children);
      continue;
    }
    out.push(...nodeToBlocks(node));
  }
  return out;
}

function nodeToBlocks(node: RootContent): Block[] {
  return [node].flatMap((node): Block[] => {
    const any = node as unknown as { type: string; name?: string; attributes?: Record<string, string>; children?: RootContent[]; value?: string; data?: { directiveLabel?: boolean } };
    switch (any.type) {
      case "paragraph": return paragraphBlocks((node as { children: PhrasingContent[] }).children);
      case "heading": return [textBlock("heading", inlineFrom((node as { children: PhrasingContent[] }).children), { level: (node as { depth: number }).depth >= 3 ? 3 : 2 })];
      case "blockquote": {
        const children = any.children ?? [];
        const callout = calloutOf(children);
        if (callout) return [textBlock("callout", inlineFrom(callout.rest), { kind: callout.kind }, nodesToBlocks(children.slice(1)))];
        const first = children[0];
        return [textBlock("quote", first?.type === "paragraph" ? inlineFrom(first.children) : [], {}, nodesToBlocks(first?.type === "paragraph" ? children.slice(1) : children))];
      }
      case "list": {
        const list = node as unknown as { ordered?: boolean; children: ListItem[] };
        return list.children.map((item) => {
          const [first, ...rest] = item.children;
          const content = first?.type === "paragraph" ? inlineFrom(first.children) : [];
          const children = nodesToBlocks(first?.type === "paragraph" ? rest : item.children);
          if (typeof item.checked === "boolean") return textBlock("checkListItem", content, { checked: item.checked }, children);
          return textBlock(list.ordered ? "numberedListItem" : "bulletListItem", content, {}, children);
        });
      }
      case "code": if (isRichLanguage((node as { lang?: string }).lang)) return [{ type: RICH_BLOCKS[(node as { lang: keyof typeof RICH_BLOCKS }).lang], props: { source: any.value ?? "" } }];
        return [{ type: "codeBlock", props: { language: (node as { lang?: string }).lang ?? "text" }, content: [{ type: "text", text: any.value ?? "", styles: {} }] }];
      case "math": return [{ type: "mathBlock", content: [{ type: "text", text: any.value ?? "", styles: {} }] }];
      case "thematicBreak": return [{ type: "divider" }];
      case "table": {
        const rows = (node as { children: TableRow[] }).children;
        return [{ type: "table", content: { type: "tableContent", columnWidths: (rows[0]?.children ?? []).map(() => undefined), headerRows: 1, rows: rows.map((row) => ({ cells: row.children.map((cell) => inlineFrom(cell.children)) })) } }];
      }
      case "leafDirective": {
        const a = any.attributes ?? {};
        if (any.name === "video" || any.name === "audio") return [{ type: any.name, props: { url: a.src ?? "" } }];
        if (any.name === "file") return [{ type: "file", props: { url: a.src ?? "", name: a.name ?? "" } }];
        if (any.name === "youtube") return [{ type: "youtube", props: { url: `https://www.youtube.com/watch?v=${a.v}` } }];
        if (any.name === "artifact") { const ref = artifactRef(a); return ref ? [{ type: "artifact", props: artifactAttributes(ref) }] : []; }
        return [];
      }
      case "containerDirective": {
        const children = any.children ?? [];
        const label = children[0] as { type?: string; data?: { directiveLabel?: boolean }; children?: PhrasingContent[] } | undefined;
        if (any.name === "indent") return [];
        const hasLabel = Boolean(label?.data?.directiveLabel);
        return [textBlock("toggleListItem", hasLabel ? inlineFrom(label!.children ?? []) : [], {}, nodesToBlocks(hasLabel ? children.slice(1) : children))];
      }
      default: return [];
    }
  });
}

export function markdownToBlocks(markdown: string): Block[] {
  const tree = parser.parse(markdown) as Root;
  restoreUnknownDirectives(tree);
  return nodesToBlocks(tree.children);
}

// --- Filtre des blocs reçus du navigateur

const MAX_BLOCKS = 20_000;

function cleanInline(content: unknown, depth = 0): Inline[] {
  if (depth > 3) return [];
  return inlineList(content).flatMap((item): Inline[] => {
    if (item?.type === "link") {
      const safe = SAFE_LINK.test(String(item.href ?? "").replace(/[\x00-\x20]+/g, ""));
      return safe ? [{ type: "link", href: String(item.href).slice(0, 2000), content: cleanInline(item.content, depth + 1) }] : cleanInline(item.content, depth + 1);
    }
    if (item?.type === "math") return [{ type: "math", content: typeof item.content === "string" ? item.content.slice(0, 5000) : item.content === undefined ? "" : cleanInline(item.content, depth + 1) }];
    if (item?.type !== "text") return [];
    const s = item.styles ?? {};
    const styles: Record<string, unknown> = {};
    for (const key of ["bold", "italic", "underline", "strike", "code"]) if (s[key] === true) styles[key] = true;
    if (isColor(s.textColor)) styles.textColor = s.textColor;
    if (isColor(s.backgroundColor)) styles.backgroundColor = s.backgroundColor;
    return [{ type: "text", text: String(item.text ?? ""), styles }];
  });
}

/** Le navigateur peut envoyer n'importe quoi : ne restent que les types, propriétés et adresses connus. */
export function sanitizeBlocks(raw: unknown): Block[] {
  let count = 0;
  const walk = (list: unknown, depth: number): Block[] => {
    if (!Array.isArray(list) || depth > 12) return [];
    return list.flatMap((value): Block[] => {
      const block = value as Block;
      if (!block || typeof block !== "object" || !BLOCK_TYPES.has(block.type) || ++count > MAX_BLOCKS) return [];
      const p = block.props ?? {};
      const props: Record<string, unknown> = {};
      if (isColor(p.textColor)) props.textColor = p.textColor;
      if (isColor(p.backgroundColor)) props.backgroundColor = p.backgroundColor;
      if (block.type === "heading") props.level = Number(p.level) >= 3 ? 3 : 2;
      if (block.type === "checkListItem") props.checked = p.checked === true;
      if (block.type === "callout") props.kind = typeof p.kind === "string" && p.kind in CALLOUT_KINDS ? p.kind : "definition";
      if (block.type === "codeBlock" && typeof p.language === "string") props.language = p.language.replace(/[^\w+-]/g, "").slice(0, 30);
      if (MEDIA_BLOCKS.has(block.type)) {
        const url = String(p.url ?? "");
        props.url = FILE_URL.test(url) ? url : "";
        if (typeof p.name === "string") props.name = p.name.slice(0, 200);
        if (typeof p.caption === "string") props.caption = p.caption.slice(0, 500);
        if (typeof p.previewWidth === "number") props.previewWidth = p.previewWidth;
      }
      // Artefact : seulement un fichier Campuss et une page d'entrée sûre ; sinon un bloc vide, à remplir dans l'éditeur
      if (block.type in RICH_LANGUAGE_OF) props.source = typeof p.source === "string" ? p.source.slice(0, MAX_RICH_SOURCE) : "";
      if (block.type === "artifact") { const ref = artifactRef(p); Object.assign(props, ref ? artifactAttributes(ref) : { src: "", entry: "index.html", title: "", display: p.display === "page" ? "page" : "bloc" }); }
      if (block.type === "youtube") { const id = youtubeId(String(p.url ?? "")); props.url = YOUTUBE_ID.test(id) ? `https://www.youtube.com/watch?v=${id}` : ""; }
      const out: Block = { type: block.type, props, children: walk(block.children, depth + 1) };
      if (typeof block.id === "string") out.id = block.id.slice(0, 40);
      if (block.type === "table") {
        const content = block.content as { rows?: { cells?: unknown[] }[]; headerRows?: unknown } | undefined;
        const rows = (content?.rows ?? []).slice(0, 200).map((row) => ({ cells: (row.cells ?? []).slice(0, 40).map((cell) => cleanInline(Array.isArray(cell) ? cell : (cell as { content?: unknown })?.content)) }));
        out.content = { type: "tableContent", columnWidths: (rows[0]?.cells ?? []).map(() => undefined), ...(content?.headerRows === 1 ? { headerRows: 1 } : {}), rows };
      } else if (!["image", "video", "audio", "file", "divider", "youtube", "artifact"].includes(block.type) && !(block.type in RICH_LANGUAGE_OF)) out.content = cleanInline(block.content);
      return [out];
    });
  };
  return walk(raw, 0);
}
