"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "cn";
import { Icon } from "@/components/icon";
import { DocFrame, type TocItem } from "@/components/reading/doc-frame";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Input } from "@/components/ui/input";
import { useCoarsePointer } from "@/hooks/use-media";
import { IconAdd, IconBold, IconCollapse, IconFont, IconHighlight, IconSaved, IconSaving, IconUiArrowDown01, IconUiArrowUp01, IconUndo } from "@/lib/icons";
import type { CampussEditor } from "./schema";
import { BLOCK_STYLES } from "./side-menu";
import { blockCatalog, filterBlocks } from "./slash-menu";
import { useEditorDoc } from "./editor-doc";
import { EditorToolbar } from "./toolbar";

const noop = () => () => {};

export type SaveState = "saved" | "dirty" | "saving";

/**
 * Enregistrement automatique : une modification arrivée pendant l'envoi repart aussitôt, rien ne reste en attente.
 * `save` renvoie une erreur lisible, ou rien.
 */
export function useAutosave(save: () => Promise<string | null | undefined>, delay = 1500) {
  const [state, setState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inFlight = useRef(false);
  const again = useRef(false);
  const latestSave = useRef(save);
  useEffect(() => { latestSave.current = save; });
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (inFlight.current) { again.current = true; return; }
    inFlight.current = true;
    setState("saving");
    do {
      again.current = false;
      try {
        const failure = await latestSave.current();
        if (failure) { setError(failure); setState("dirty"); }
        else { setError(null); if (!again.current) setState("saved"); }
      } catch {
        setState("dirty");
        setError("L’enregistrement a échoué. Ton texte est encore là : on réessaie à ta prochaine modification.");
      }
    } while (again.current);
    inFlight.current = false;
  }, []);
  const touch = useCallback((wait = delay) => {
    setState("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), wait);
  }, [delay, flush]);
  const cancel = useCallback(() => clearTimeout(timer.current), []);
  const busy = () => inFlight.current;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key === "s") { event.preventDefault(); void flush(); } };
    const onLeave = (event: BeforeUnloadEvent) => { if (state !== "saved") event.preventDefault(); };
    addEventListener("keydown", onKey);
    addEventListener("beforeunload", onLeave);
    return () => { removeEventListener("keydown", onKey); removeEventListener("beforeunload", onLeave); };
  }, [flush, state]);
  return { state, setState, error, setError, touch, flush, cancel, busy };
}

/** État d'enregistrement : un point qui pulse pendant la frappe, puis « Enregistré » en fondu. */
export function SaveStatus({ state, label }: { state: SaveState; label?: string }) {
  return (
    <span role="status" className="ml-auto inline-flex shrink-0 items-center gap-1.5 px-1 text-sm whitespace-nowrap text-muted-foreground">
      {label ?? (state === "saved"
        ? <span key="saved" className="inline-flex items-center gap-1.5 animate-in fade-in-0 duration-150"><Icon icon={IconSaved} size={16} className="text-success" />Enregistré</span>
        : state === "saving"
          ? <span key="saving" className="inline-flex items-center gap-1.5"><Icon icon={IconSaving} size={16} className="motion-ok:animate-spin" /><span className="max-sm:sr-only">Enregistrement…</span></span>
          : <span key="dirty" className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-muted-foreground/60 motion-ok:animate-pulse" /><span className="max-sm:sr-only">Modifications…</span></span>)}
    </span>
  );
}

/** Le clavier du téléphone est ouvert quand la zone visible rétrécit pendant qu'on écrit. */
function useKeyboard(coarse: boolean) {
  const [box, setBox] = useState<{ bottom: number } | null>(null);
  useEffect(() => {
    if (!coarse || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const read = () => {
      const typing = Boolean(document.activeElement?.closest(".bn-editor, textarea, input"));
      const open = typing && viewport.height < window.innerHeight - 120;
      setBox(open || typing ? { bottom: window.innerHeight - (viewport.offsetTop + viewport.height) } : null);
    };
    read();
    viewport.addEventListener("resize", read);
    viewport.addEventListener("scroll", read);
    document.addEventListener("focusin", read);
    document.addEventListener("focusout", () => setTimeout(read, 50));
    return () => { viewport.removeEventListener("resize", read); viewport.removeEventListener("scroll", read); document.removeEventListener("focusin", read); };
  }, [coarse]);
  return box;
}

/** Au téléphone, au-dessus du clavier : + (blocs), Aa (style), Gras, Surligner, Monter, Descendre, Annuler, Fermer le clavier. */
function AccessoryBar({ editor, bottom, onOcr }: { editor: CampussEditor; bottom: number; onOcr?: () => void }) {
  const [sheet, setSheet] = useState<"blocks" | "styles" | null>(null);
  const [query, setQuery] = useState("");
  const keep = (run: () => void) => (event: React.PointerEvent | React.MouseEvent) => { event.preventDefault(); run(); };
  const tool = "flex size-11 shrink-0 items-center justify-center rounded-lg text-foreground active:bg-muted";
  const items = filterBlocks(blockCatalog(editor, { onOcr, artifact: useEditorDoc() !== null }), query);
  return (
    <>
      <div role="toolbar" aria-label="Écrire" data-reading-bar style={{ bottom }} className="fixed inset-x-0 z-(--z-tabbar) flex items-center gap-0.5 overflow-x-auto border-t border-border bg-card px-1 [scrollbar-width:none]">
        <button type="button" aria-label="Insérer un bloc" className={tool} onMouseDown={keep(() => setSheet("blocks"))}><Icon icon={IconAdd} size={24} /></button>
        <button type="button" aria-label="Style du paragraphe" className={tool} onMouseDown={keep(() => setSheet("styles"))}><Icon icon={IconFont} /></button>
        <button type="button" aria-label="Gras" className={tool} onMouseDown={keep(() => editor.toggleStyles({ bold: true } as never))}><Icon icon={IconBold} /></button>
        <button type="button" aria-label="Surligner" className={tool} onMouseDown={keep(() => editor.toggleStyles({ backgroundColor: "yellow" } as never))}><Icon icon={IconHighlight} /></button>
        <button type="button" aria-label="Monter le bloc" className={tool} onMouseDown={keep(() => editor.moveBlocksUp())}><Icon icon={IconUiArrowUp01} /></button>
        <button type="button" aria-label="Descendre le bloc" className={tool} onMouseDown={keep(() => editor.moveBlocksDown())}><Icon icon={IconUiArrowDown01} /></button>
        <button type="button" aria-label="Annuler" className={tool} onMouseDown={keep(() => editor.undo())}><Icon icon={IconUndo} /></button>
        <button type="button" aria-label="Fermer le clavier" className={cn(tool, "ml-auto")} onMouseDown={keep(() => (document.activeElement as HTMLElement | null)?.blur())}><Icon icon={IconCollapse} /></button>
      </div>
      <ResponsiveSheet open={sheet === "blocks"} onOpenChange={(open) => { if (!open) { setSheet(null); setQuery(""); } }} title="Insérer">
        <Input aria-label="Chercher un bloc" placeholder="Chercher…" value={query} onChange={(event) => setQuery(event.target.value)} className="mb-2" />
        <ul className="-mx-2 grid pb-2">
          {items.map((item) => (
            <li key={`${item.group}-${item.key}`}>
              <button type="button" className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left" onClick={() => { setSheet(null); setQuery(""); editor.focus(); item.onItemClick(); }}>
                <span className={cn("flex size-7 items-center justify-center rounded-md", item.ai ? "ai-border" : "bg-muted text-muted-foreground")}><Icon icon={item.glyph} size={16} /></span>
                <span className={cn(item.ai && "ai-text font-semibold")}>{item.title}</span>
              </button>
            </li>
          ))}
          {!items.length && <li className="px-3 py-2 text-sm text-muted-foreground">Aucun bloc</li>}
        </ul>
      </ResponsiveSheet>
      <ResponsiveSheet open={sheet === "styles"} onOpenChange={(open) => { if (!open) setSheet(null); }} title="Style">
        <ul className="-mx-2 grid pb-2">
          {BLOCK_STYLES.map((s) => (
            <li key={s.label}><button type="button" className="flex min-h-11 w-full items-center rounded-lg px-3 text-left" onClick={() => { setSheet(null); editor.updateBlock(editor.getTextCursorPosition().block, { type: s.type, props: s.props ?? {} } as never); editor.focus(); }}>{s.label}</button></li>
          ))}
        </ul>
      </ResponsiveSheet>
    </>
  );
}

/**
 * Écrire sur la page finale : barre du haut allégée, grille de lecture, un seul bouton d'envoi.
 * Commun aux cours et aux actualités. Au téléphone, la barre d'envoi se pose au-dessus des onglets,
 * remplacée par la barre d'accessoires (au-dessus du clavier) pendant la saisie.
 */
export function PageEditor({ editor, toc = [], importer, status, actions, onOcr, children }: {
  editor: CampussEditor; toc?: TocItem[]; importer?: ReactNode; status: ReactNode; actions: ReactNode; onOcr?: () => void; children: ReactNode;
}) {
  const coarse = useCoarsePointer();
  const keyboard = useKeyboard(coarse);
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return (
    <>
      <div className="doc-edit-bar sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-(--z-sticky) -mx-4 -mt-4 mb-6 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-1.5 backdrop-blur-md md:-mx-6 md:-mt-6 md:px-6 lg:-mx-8 lg:px-8">
        <EditorToolbar editor={editor} importer={importer} status={status} onOcr={onOcr} />
        <div className="hidden shrink-0 items-center gap-2 md:flex">{actions}</div>
      </div>
      <DocFrame items={toc} stickyTop="7rem">
        <div className="motion-ok:animate-in motion-ok:fade-in-0 motion-ok:duration-300">{children}</div>
      </DocFrame>
      {/* Hors de la page : la grille est un conteneur de requête, un élément fixe y serait mal placé */}
      {mounted && createPortal(
        keyboard
          ? <AccessoryBar editor={editor} bottom={keyboard.bottom} onOcr={onOcr} />
          : <div data-reading-bar className="fixed inset-x-0 bottom-(--bottom-offset) z-(--z-sticky) flex items-center justify-end gap-2 border-t border-border bg-card/95 px-4 py-2 backdrop-blur-md md:hidden">{actions}</div>,
        document.body,
      )}
    </>
  );
}
