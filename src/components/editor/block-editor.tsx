"use client";

import "@blocknote/shadcn/style.css";
import "@blocknote/math-block/style.css";
import { FilePanelController, FormattingToolbarController, SideMenuController, SuggestionMenuController, UploadTab, useComponentsContext, useDictionary, type FilePanelProps } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { useEffect, useState, type KeyboardEvent } from "react";
import { useCoarsePointer } from "@/hooks/use-media";
import { hasForeignMedia, type Block } from "@/lib/blocks";
import { BUBBLE_POPUP, FormattingBubble } from "./formatting-bubble";

// Un clic dans une fenêtre de la bulle (couleurs, lien) n'est pas un clic à l'extérieur : la bulle reste ouverte
const BUBBLE_FLOATING = { useDismissProps: { outsidePress: (event: MouseEvent) => !(event.target as Element | null)?.closest?.(`[${BUBBLE_POPUP}]`) } };
import { useEditorDoc } from "./editor-doc";
import type { CampussEditor } from "./schema";
import { BlockHandle, duplicateBlock } from "./side-menu";
import { blockCatalog, filterBlocks, SlashMenu, type SlashItem } from "./slash-menu";

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const read = () => {
      const html = document.documentElement.classList;
      setTheme(html.contains("dark") || (!html.contains("light") && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light");
    };
    read();
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", read);
    return () => media.removeEventListener("change", read);
  }, []);
  return theme;
}

/** Le panneau d'origine propose aussi d'intégrer une adresse : ce serait une image bloquée par la politique du site. */
function UploadOnlyPanel({ blockId }: FilePanelProps) {
  const Components = useComponentsContext()!;
  const dictionary = useDictionary();
  const [loading, setLoading] = useState(false);
  const title = dictionary.file_panel.upload.title;
  return <Components.FilePanel.Root className="bn-panel" defaultOpenTab={title} openTab={title} setOpenTab={() => undefined} loading={loading} tabs={[{ name: title, tabPanel: <UploadTab blockId={blockId} setLoading={setLoading} /> }]} />;
}

type Changes = { getChanges: () => { type: string; block: unknown; source?: { type: string } }[] };

/**
 * La surface d'écriture : menu « / » compact, une seule poignée, une seule bulle de mise en forme.
 * Au doigt, ni poignée ni bulle : la barre d'accessoires au-dessus du clavier les remplace.
 */
export function EditorSurface({ editor, editable = true, onChange, onForeignMedia, onOcr, label = "Texte du cours" }: { editor: CampussEditor; editable?: boolean; onChange?: (fromHere: boolean) => void; onForeignMedia?: () => void; onOcr?: () => void; label?: string }) {
  const docId = useEditorDoc();
  const theme = useTheme();
  const coarse = useCoarsePointer();
  // Un collage peut apporter une image d'un autre site : le bloc redevient vide tout de suite, le serveur la retirerait de toute façon
  // Vaut aussi pour ce qui arrive du temps réel : un co-auteur ne peut pas faire charger une image extérieure aux autres
  const changed = (_: unknown, context: Changes) => {
    const changes = context.getChanges();
    const foreign = changes.flatMap((change) => (change.type !== "delete" && hasForeignMedia(change.block as Block) ? [change.block as Block] : []));
    if (foreign.length) {
      queueMicrotask(() => { for (const block of foreign) editor.updateBlock(block as never, { props: { url: "" } } as never); });
      onForeignMedia?.();
    }
    onChange?.(changes.some((change) => change.source?.type !== "yjs-remote"));
  };
  // Raccourcis du menu de bloc : dupliquer, monter, descendre
  const onKeyDown = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === "d" && !event.shiftKey) { event.preventDefault(); duplicateBlock(editor, editor.getTextCursorPosition().block as never); }
    else if (event.shiftKey && event.key === "ArrowUp") { event.preventDefault(); editor.moveBlocksUp(); }
    else if (event.shiftKey && event.key === "ArrowDown") { event.preventDefault(); editor.moveBlocksDown(); }
  };
  return (
    <div aria-label={label} onKeyDownCapture={onKeyDown}>
      <BlockNoteView editor={editor} editable={editable} theme={theme} onChange={changed as never} slashMenu={false} filePanel={false} sideMenu={false} formattingToolbar={false} className="campuss-editor">
        <FilePanelController filePanel={UploadOnlyPanel} />
        <SuggestionMenuController<(query: string) => Promise<SlashItem[]>> triggerCharacter="/" suggestionMenuComponent={SlashMenu} getItems={async (query) => filterBlocks(blockCatalog(editor, { onOcr, artifact: docId !== null }), query)} onItemClick={(item) => item.onItemClick()} />
        {!coarse && <SideMenuController sideMenu={BlockHandle} />}
        {!coarse && <FormattingToolbarController formattingToolbar={FormattingBubble} floatingUIOptions={BUBBLE_FLOATING} />}
      </BlockNoteView>
    </div>
  );
}
