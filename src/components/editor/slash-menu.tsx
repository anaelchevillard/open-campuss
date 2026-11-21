"use client";

import { insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions";
import { getMathSlashMenuItems } from "@blocknote/math-block";
import type { SuggestionMenuProps } from "@blocknote/react";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "cn";
import { Icon } from "@/components/icon";
import { Kbd } from "@/components/ui/kbd";
import { CALLOUT_KINDS, type CalloutKind } from "@/lib/blocks";
import { foldText as fold, matchesBlock } from "@/lib/reading-layout";
import {
  IconAiScan, IconAudio, IconBulletList, IconCallout, IconCheckList, IconCode, IconDivider, IconExpand, IconFile, IconFormula, IconH2, IconH3,
  IconImage, IconNumberList, IconQuote, IconStats, IconTable, IconText, IconTip, IconVideo, IconWarning, IconYoutube, type IconData,
} from "@/lib/icons";
import { snappy } from "@/lib/motion";
import type { CampussEditor } from "./schema";

export type SlashItem = {
  key: string; title: string; group: string; aliases: string[]; glyph: IconData; kbd?: string; ai?: boolean;
  onItemClick: () => void;
};

const RECENT_KEY = "campuss-slash-recent";
const USES_KEY = "campuss-slash-uses";
const CALLOUT_ICONS: Record<CalloutKind, IconData> = { definition: IconCallout, theoreme: IconCallout, retenir: IconTip, exemple: IconText, attention: IconWarning };


const read = (key: string): string[] => { try { return JSON.parse(localStorage.getItem(key) ?? "[]") as string[]; } catch { return []; } };
function remember(key: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([key, ...read(RECENT_KEY).filter((k) => k !== key)].slice(0, 3)));
    localStorage.setItem(USES_KEY, String((Number(localStorage.getItem(USES_KEY)) || 0) + 1));
  } catch { /* stockage indisponible : rien de grave */ }
}
const uses = () => { try { return Number(localStorage.getItem(USES_KEY)) || 0; } catch { return 0; } };

/** Le catalogue des blocs : le même pour le menu « / », le bouton Insérer et la barre du téléphone. */
export function blockCatalog(editor: CampussEditor, options: { onOcr?: () => void; artifact?: boolean } = {}): SlashItem[] {
  const put = (block: Record<string, unknown>) => () => { insertOrUpdateBlockForSlashMenu(editor as never, block as never); };
  const items: (Omit<SlashItem, "onItemClick"> & { run: () => void })[] = [];
  const add = (item: Omit<SlashItem, "onItemClick">, run: () => void) => items.push({ ...item, run });
  add({ key: "paragraph", title: "Texte", group: "Texte", aliases: ["paragraphe", "paragraph", "text", "p"], glyph: IconText }, put({ type: "paragraph" }));
  add({ key: "h2", title: "Titre", group: "Texte", aliases: ["heading", "h2", "titre", "section"], glyph: IconH2, kbd: "##" }, put({ type: "heading", props: { level: 2 } }));
  add({ key: "h3", title: "Sous-titre", group: "Texte", aliases: ["heading", "h3", "subheading", "sous titre"], glyph: IconH3, kbd: "###" }, put({ type: "heading", props: { level: 3 } }));
  add({ key: "bullet", title: "Liste à puces", group: "Texte", aliases: ["liste", "bullet", "ul", "puces", "list"], glyph: IconBulletList, kbd: "-" }, put({ type: "bulletListItem" }));
  add({ key: "number", title: "Liste numérotée", group: "Texte", aliases: ["liste", "numbered", "ol", "ordered", "numeros"], glyph: IconNumberList, kbd: "1." }, put({ type: "numberedListItem" }));
  add({ key: "check", title: "Liste de tâches", group: "Texte", aliases: ["todo", "check", "cases", "taches", "checklist"], glyph: IconCheckList, kbd: "[]" }, put({ type: "checkListItem" }));
  add({ key: "quote", title: "Citation", group: "Texte", aliases: ["quote", "citation", "blockquote"], glyph: IconQuote, kbd: ">" }, put({ type: "quote" }));
  add({ key: "toggle", title: "Dépliant", group: "Texte", aliases: ["toggle", "depliant", "accordeon", "details"], glyph: IconExpand }, put({ type: "toggleListItem" }));
  add({ key: "code", title: "Code", group: "Texte", aliases: ["code", "pre", "programme"], glyph: IconCode, kbd: "```" }, put({ type: "codeBlock" }));
  for (const [kind, title] of Object.entries(CALLOUT_KINDS) as [CalloutKind, string][]) {
    add({ key: `callout-${kind}`, title, group: "Cours", aliases: ["encadre", "callout", kind, fold(title)], glyph: CALLOUT_ICONS[kind] }, put({ type: "callout", props: { kind } }));
  }
  add({ key: "table", title: "Tableau", group: "Insérer", aliases: ["table", "tableau", "grille"], glyph: IconTable }, put({ type: "table", content: { type: "tableContent", rows: [{ cells: ["", "", ""] }, { cells: ["", "", ""] }] } }));
  add({ key: "math", title: "Formule", group: "Insérer", aliases: ["math", "latex", "equation", "formule", "katex"], glyph: IconFormula, kbd: "$$" }, () => { const [math] = getMathSlashMenuItems(editor as never); if (math) math.onItemClick(); else put({ type: "mathBlock" })(); });
  add({ key: "divider", title: "Séparateur", group: "Insérer", aliases: ["divider", "hr", "separateur", "ligne", "trait"], glyph: IconDivider, kbd: "---" }, put({ type: "divider" }));
  add({ key: "image", title: "Image", group: "Médias", aliases: ["image", "photo", "picture", "img"], glyph: IconImage }, put({ type: "image" }));
  add({ key: "video", title: "Vidéo", group: "Médias", aliases: ["video", "film", "mp4"], glyph: IconVideo }, put({ type: "video" }));
  add({ key: "youtube", title: "YouTube", group: "Médias", aliases: ["youtube", "video", "yt"], glyph: IconYoutube }, put({ type: "youtube" }));
  add({ key: "audio", title: "Audio", group: "Médias", aliases: ["audio", "son", "sound", "mp3"], glyph: IconAudio }, put({ type: "audio" }));
  add({ key: "file", title: "Fichier", group: "Médias", aliases: ["file", "fichier", "pdf", "piece jointe"], glyph: IconFile }, put({ type: "file" }));
  add({ key: "vega", title: "Graphique", group: "Figures", aliases: ["graphique", "chart", "vega", "vega-lite", "barres", "courbe", "diagramme"], glyph: IconStats }, put({ type: "vegaLite" }));
  add({ key: "plot", title: "Graphe de fonctions", group: "Figures", aliases: ["fonction", "graphe", "plot", "courbe", "mafs", "repere"], glyph: IconFormula }, put({ type: "plot" }));
  add({ key: "tikz", title: "Figure TikZ", group: "Figures", aliases: ["tikz", "latex", "figure", "schema", "dessin"], glyph: IconCode }, put({ type: "tikz" }));
  add({ key: "svg", title: "Figure SVG", group: "Figures", aliases: ["svg", "vectoriel", "dessin", "figure"], glyph: IconImage }, put({ type: "svgFigure" }));
  if (options.artifact) add({ key: "artifact", title: "Artefact HTML", group: "Insérer", aliases: ["artefact", "artifact", "html", "page", "react", "jsx", "simulation", "interactif"], glyph: IconCode }, put({ type: "artifact" }));
  if (options.onOcr) add({ key: "ocr", title: "Transcrire une photo", group: "Campuss IA", aliases: ["ocr", "photo", "scan", "transcrire", "ia", "ai"], glyph: IconAiScan, ai: true }, options.onOcr);
  return items.map(({ run, ...item }) => ({ ...item, onItemClick: () => { remember(item.key); run(); } }));
}

/** Recherche sans accents, sur le titre et les alias français et anglais ; sans requête, les 3 blocs récents en tête. */
export function filterBlocks(items: SlashItem[], query: string): SlashItem[] {
  if (!query.trim()) {
    const recent = read(RECENT_KEY).map((key) => items.find((i) => i.key === key)).filter((i): i is SlashItem => Boolean(i));
    return [...recent.map((i) => ({ ...i, group: "Récents" })), ...items];
  }
  return items.filter((item) => matchesBlock(item, query));
}

/** Menu « / » compact : 18rem × 20rem, lignes de 32 px (44 px au doigt), raccourci Markdown à droite. */
export function SlashMenu({ items, selectedIndex, onItemClick }: SuggestionMenuProps<SlashItem>) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector("[aria-selected=true]")?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);
  const showFooter = uses() < 20;
  if (!items.length) return (
    <div className="slash-menu w-72 rounded-xl border border-border bg-popover p-3 text-sm text-muted-foreground shadow-lg">Aucun bloc</div>
  );
  return (
    <div className="slash-menu flex max-h-80 w-72 flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg origin-top-left animate-in fade-in-0 duration-100 motion-ok:zoom-in-[.97]">
      <div ref={list} id="bn-suggestion-menu" role="listbox" aria-label="Blocs" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
        {items.map((item, index) => {
          const header = index === 0 || items[index - 1].group !== item.group;
          const selected = index === selectedIndex;
          return (
            <div key={`${item.group}-${item.key}`}>
              {header && <p className={cn("px-2 pt-2 pb-1 text-xs font-semibold text-muted-foreground", item.ai && "ai-text")}>{item.group}</p>}
              <div id={`bn-suggestion-menu-item-${index}`} role="option" aria-selected={selected} onMouseDown={(event) => event.preventDefault()} onClick={() => onItemClick?.(item)}
                className="relative flex min-h-8 cursor-pointer items-center gap-2.5 rounded-md px-1.5 coarse:min-h-11">
                {selected && <motion.span layoutId="slash-selected" transition={snappy} className="absolute inset-0 rounded-md bg-muted" />}
                <span className={cn("relative flex size-6 shrink-0 items-center justify-center rounded-md", item.ai ? "ai-border" : "bg-muted text-muted-foreground", selected && !item.ai && "bg-background")}>
                  <Icon icon={item.glyph} size={16} className={item.ai ? "text-[var(--ai-3)]" : undefined} />
                </span>
                <span className={cn("relative min-w-0 flex-1 truncate text-sm", item.ai && "ai-text font-semibold")}>{item.title}</span>
                {item.kbd && <Kbd className="relative coarse:hidden">{item.kbd}</Kbd>}
              </div>
            </div>
          );
        })}
      </div>
      {showFooter && (
        <p className="flex items-center gap-2 border-t border-border px-3 py-1.5 text-xs text-muted-foreground coarse:hidden">
          <Kbd>↑↓</Kbd>choisir<Kbd>↵</Kbd>insérer<Kbd>esc</Kbd>fermer
        </p>
      )}
    </div>
  );
}
