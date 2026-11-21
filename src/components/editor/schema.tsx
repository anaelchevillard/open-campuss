"use client";

import { BlockNoteSchema, createHeadingBlockSpec, defaultProps } from "@blocknote/core";
import { createReactInlineMathSpec, createReactMathBlockSpec } from "@blocknote/math-block";
import { createReactBlockSpec } from "@blocknote/react";
import { useState } from "react";
import { CALLOUT_KINDS, type CalloutKind, youtubeId } from "@/lib/blocks";
import type { RichLanguage } from "@/lib/rich/languages";
import { ArtifactBlock } from "./artifact-block";
import { RichBlock } from "./rich-blocks";

const Callout = createReactBlockSpec(
  { type: "callout", propSchema: { textColor: defaultProps.textColor, backgroundColor: defaultProps.backgroundColor, kind: { default: "definition", values: Object.keys(CALLOUT_KINDS) as CalloutKind[] } }, content: "inline" },
  {
    // Le type se choisit dans le menu « / » (Définition, Théorème…) : le bloc ne montre que son nom
    render: ({ block, contentRef }) => (
      <div className="editor-callout" data-kind={block.props.kind}>
        <span contentEditable={false} className="shrink-0 text-[0.9em] font-semibold select-none">{CALLOUT_KINDS[block.props.kind as CalloutKind]}</span>
        <div ref={contentRef} className="min-w-0 flex-1" />
      </div>
    ),
  },
);

function YoutubeBlock({ url, onChange }: { url: string; onChange: (url: string) => void }) {
  const [value, setValue] = useState(url);
  const id = youtubeId(url);
  if (id) return <div contentEditable={false} className="aspect-video w-full max-w-2xl overflow-hidden rounded-lg"><iframe title="Vidéo YouTube" src={`https://www.youtube-nocookie.com/embed/${id}`} className="size-full" allowFullScreen sandbox="allow-scripts allow-same-origin allow-presentation" /></div>;
  return (
    <div contentEditable={false} className="flex w-full max-w-2xl gap-2 rounded-lg bg-muted p-3">
      <input aria-label="Adresse de la vidéo YouTube" value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onChange(value); } }} placeholder="Colle l’adresse de la vidéo YouTube" className="h-9 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-sm" />
      <button type="button" onClick={() => onChange(value)} className="h-9 rounded-md border border-input px-3 text-sm font-semibold hover:bg-muted">Ajouter</button>
    </div>
  );
}

const Youtube = createReactBlockSpec(
  { type: "youtube", propSchema: { url: { default: "" } }, content: "none" },
  { render: ({ block, editor }) => <YoutubeBlock url={block.props.url} onChange={(url) => editor.updateBlock(block, { props: { url } })} /> },
);

// L'artefact HTML, rendu dans un cadre isolé de l'origine de contenu (format : lib/rich/artifact.ts)
const Artifact = createReactBlockSpec(
  { type: "artifact", propSchema: { src: { default: "" }, entry: { default: "index.html" }, title: { default: "" }, display: { default: "bloc", values: ["bloc", "page"] } }, content: "none" },
  { render: ({ block, editor }) => <ArtifactBlock props={block.props} onChange={(next) => editor.updateBlock(block, { props: next } as never)} /> },
);

// Graphique, figure TikZ, graphe de fonctions, SVG ; enregistrés en blocs de code de ce langage
const richSpec = (type: string, lang: RichLanguage) => createReactBlockSpec(
  { type, propSchema: { source: { default: "" } }, content: "none" },
  { render: ({ block, editor }) => <RichBlock lang={lang} source={block.props.source} onChange={(source) => editor.updateBlock(block, { props: { source } } as never)} /> },
);
const VegaLite = richSpec("vegaLite", "vega-lite");
const Tikz = richSpec("tikz", "tikz");
const PlotBlock = richSpec("plot", "plot");
const SvgFigure = richSpec("svgFigure", "svg-figure");

/** Les mêmes blocs pour tous, en rédaction comme en révision. */
export const campussSchema = BlockNoteSchema.create().extend({
  blockSpecs: {
    heading: createHeadingBlockSpec({ levels: [2, 3] }),
    callout: Callout(),
    youtube: Youtube(),
    artifact: Artifact(),
    vegaLite: VegaLite(),
    tikz: Tikz(),
    plot: PlotBlock(),
    svgFigure: SvgFigure(),
    mathBlock: createReactMathBlockSpec(),
  },
  inlineContentSpecs: { math: createReactInlineMathSpec() },
});

export type CampussEditor = typeof campussSchema.BlockNoteEditor;
