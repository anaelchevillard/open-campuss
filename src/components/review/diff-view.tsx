"use client";

import { useState } from "react";
import { cn } from "cn";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { onlyChanges, type DiffBlock, type DiffPart } from "@/lib/line-diff";

/** Une ligne de Markdown lue comme du texte : titre, élément de liste, citation ou paragraphe. Les marques en ligne restent. */
function shapeOf(text: string) {
  const heading = /^(#{1,4})\s+/.exec(text);
  if (heading) return { tag: "heading" as const, strip: heading[0].length };
  const item = /^\s*(?:[-*+]|\d+[.)])\s+/.exec(text);
  if (item) return { tag: "item" as const, strip: item[0].length };
  const quote = /^>\s?/.exec(text);
  if (quote) return { tag: "quote" as const, strip: quote[0].length };
  return { tag: "p" as const, strip: 0 };
}

/** Retire le préfixe Markdown du premier morceau seulement : le reste du texte garde ses marques d'ajout et de retrait. */
function stripPrefix(parts: DiffPart[], n: number) {
  if (!n) return parts;
  const out: DiffPart[] = [];
  let left = n;
  for (const part of parts) {
    if (left <= 0) { out.push(part); continue; }
    const cut = Math.min(left, part.text.length);
    left -= cut;
    if (part.text.length > cut) out.push({ ...part, text: part.text.slice(cut) });
  }
  return out;
}

function Parts({ parts }: { parts: DiffPart[] }) {
  return (
    <>
      {parts.map((p, i) => p.kind === "add" ? <ins key={i} className="diff-add"><span className="sr-only">[ajouté : </span>{p.text}<span className="sr-only">]</span></ins>
        : p.kind === "del" ? <del key={i} className="diff-del"><span className="sr-only">[retiré : </span>{p.text}<span className="sr-only">]</span></del>
          : <span key={i}>{p.text}</span>)}
    </>
  );
}

function Block({ block }: { block: DiffBlock }) {
  const first = block.parts.map((p) => p.text).join("");
  const shape = shapeOf(block.kind === "change" ? (block.parts.find((p) => p.kind !== "add")?.text ?? first) : first);
  const parts = stripPrefix(block.parts, shape.strip);
  const edge = block.kind === "add" ? "diff-block-add" : block.kind === "del" ? "diff-block-del" : undefined;
  if (shape.tag === "heading") return <h3 className={cn("heading mt-2", edge)}><Parts parts={parts} /></h3>;
  if (shape.tag === "item") return <p className={cn("relative pl-5 before:absolute before:left-1 before:content-['•'] before:text-muted-foreground", edge)}><Parts parts={parts} /></p>;
  if (shape.tag === "quote") return <blockquote className={cn("border-l-2 border-border pl-4 text-muted-foreground", edge)}><Parts parts={parts} /></blockquote>;
  return <p className={edge}><Parts parts={parts} /></p>;
}

/** Correction lue au mot, dans la colonne de lecture : « Changements seuls » par défaut, « Tout » pour le texte entier. */
export function DiffView({ blocks, className }: { blocks: DiffBlock[]; className?: string }) {
  const [mode, setMode] = useState<"changes" | "all">("changes");
  const view = mode === "all" ? blocks : onlyChanges(blocks);
  return (
    <div className={cn("grid gap-4", className)}>
      <ToggleGroup variant="outline" size="sm" spacing={0} value={[mode]} onValueChange={(v: string[]) => { if (v[0]) setMode(v[0] as "changes" | "all"); }} aria-label="Affichage">
        <ToggleGroupItem value="changes">Changements seuls</ToggleGroupItem>
        <ToggleGroupItem value="all">Tout</ToggleGroupItem>
      </ToggleGroup>
      <div data-reading className="grid gap-3 text-pretty">
        {view.map((block, i) => block.kind === "gap"
          ? <p key={i} className="text-center text-sm text-muted-foreground" aria-label={`${block.count} paragraphes inchangés`}>· · ·</p>
          : <Block key={i} block={block} />)}
      </div>
    </div>
  );
}
