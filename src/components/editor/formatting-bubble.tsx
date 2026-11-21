"use client";

import { useBlockNoteEditor, useEditorSelectionChange, useEditorChange } from "@blocknote/react";
import { useCallback, useState } from "react";
import { cn } from "cn";
import { Icon } from "@/components/icon";
import { SelectionToolbar } from "@/components/reading/selection-toolbar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { COLORS } from "@/lib/course";
import { IconBold, IconFormula, IconHighlight, IconItalic, IconLink, IconStrike, IconUnderline } from "@/lib/icons";
import type { CampussEditor } from "./schema";
import { COLOR_LABELS } from "./side-menu";

const TRIGGER = "flex min-h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-lg px-1.5 text-sm transition-colors hover-ok:bg-muted data-popup-open:bg-muted";

/** Attribut des fenêtres ouvertes depuis la bulle : BlockNote ne doit pas les prendre pour un clic à l'extérieur (voir block-editor). */
export const BUBBLE_POPUP = "data-bubble-popup";

/**
 * Les fenêtres de la bulle sont rendues hors de l'éditeur : sans cet enregistrement, BlockNote croit l'éditeur quitté
 * quand le focus y entre, masque la bulle et la fenêtre disparaît avec elle.
 */
function useEditorPortal(editor: CampussEditor) {
  return useCallback((element: HTMLElement | null) => {
    if (!element) return;
    const host = editor as unknown as { registerPortalElement: (el: HTMLElement) => void; unregisterPortalElement: (el: HTMLElement) => void };
    host.registerPortalElement(element);
    return () => host.unregisterPortalElement(element);
  }, [editor]);
}

/** La seule bulle de mise en forme de l'éditeur : la même que pour annoter un cours, plus le lien et la formule. */
export function FormattingBubble() {
  const editor = useBlockNoteEditor() as unknown as CampussEditor;
  const portal = useEditorPortal(editor);
  const [, refresh] = useState(0);
  useEditorSelectionChange(() => refresh((n) => n + 1), editor as never);
  useEditorChange(() => refresh((n) => n + 1), editor as never);
  const [link, setLink] = useState("");
  const styles = editor.getActiveStyles() as Record<string, unknown>;
  const toggle = (style: Record<string, unknown>) => { editor.toggleStyles(style as never); editor.focus(); };
  const colored = Boolean(styles.backgroundColor || styles.textColor);
  const groups = [[
    { key: "bold", label: "Gras", icon: IconBold, shortcut: "Ctrl B", pressed: Boolean(styles.bold), onClick: () => toggle({ bold: true }) },
    { key: "italic", label: "Italique", icon: IconItalic, shortcut: "Ctrl I", pressed: Boolean(styles.italic), onClick: () => toggle({ italic: true }) },
    { key: "underline", label: "Souligner", icon: IconUnderline, shortcut: "Ctrl U", pressed: Boolean(styles.underline), onClick: () => toggle({ underline: true }) },
    { key: "strike", label: "Barrer", icon: IconStrike, pressed: Boolean(styles.strike), onClick: () => toggle({ strike: true }) },
  ]];
  const extra = (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger aria-label="Surligner et colorer" className={cn(TRIGGER, colored && "bg-brand-tint text-brand-text")}><Icon icon={IconHighlight} size={16} strokeWidth={2} /></DropdownMenuTrigger>
        <DropdownMenuContent ref={portal} data-bubble-popup="" align="start" className="w-44" finalFocus={() => { editor.focus(); return false; }}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Surligner</DropdownMenuLabel>
            {COLORS.filter((c) => c !== "brown" && c !== "gray").map((c) => <DropdownMenuItem key={c} onClick={() => toggle({ backgroundColor: c })}><mark className={`hl-${c} rounded-sm px-1.5`}>{COLOR_LABELS[c]}</mark></DropdownMenuItem>)}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Couleur du texte</DropdownMenuLabel>
            {COLORS.filter((c) => c !== "yellow" && c !== "brown").map((c) => <DropdownMenuItem key={`t-${c}`} onClick={() => toggle({ textColor: c })}><span className={`tc-${c}`}>Texte {COLOR_LABELS[c].toLowerCase()}</span></DropdownMenuItem>)}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => { editor.removeStyles({ backgroundColor: styles.backgroundColor, textColor: styles.textColor } as never); editor.focus(); }}>Retirer la couleur</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-border" />
      <Popover onOpenChange={(open) => { if (open) setLink(editor.getSelectedLinkUrl() ?? ""); }}>
        <PopoverTrigger aria-label="Lien" className={TRIGGER}><Icon icon={IconLink} size={16} strokeWidth={2} /></PopoverTrigger>
        <PopoverContent ref={portal} data-bubble-popup="" align="start" className="w-72">
          <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (/^https?:\/\//.test(link)) editor.createLink(link); editor.focus(); }}>
            <Input aria-label="Adresse du lien" value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://…" autoFocus />
            <Button type="submit" variant="outline">Lier</Button>
          </form>
        </PopoverContent>
      </Popover>
      <button type="button" aria-label="Formule en ligne" className={TRIGGER} onClick={() => { const text = editor.getSelectedText(); editor.insertInlineContent([{ type: "math", content: text } as never, " "]); editor.focus(); }}>
        <Icon icon={IconFormula} size={16} strokeWidth={2} />
      </button>
    </>
  );
  return <SelectionToolbar label="Mise en forme" groups={groups} extra={extra} />;
}
