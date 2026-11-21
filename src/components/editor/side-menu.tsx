"use client";

import { SideMenuExtension, SuggestionMenu } from "@blocknote/core/extensions";
import { useBlockNoteEditor, useEditorSelectionChange, useExtension, useExtensionState } from "@blocknote/react";
import { useState } from "react";
import { cn } from "cn";
import { Icon } from "@/components/icon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { COLORS } from "@/lib/course";
import { IconAdd, IconCopy, IconDelete, IconDragHandle, IconPalette, IconRefresh, IconUiArrowDown01, IconUiArrowUp01 } from "@/lib/icons";
import type { CampussEditor } from "./schema";

export const COLOR_LABELS: Record<string, string> = { yellow: "Jaune", green: "Vert", blue: "Bleu", pink: "Rose", purple: "Violet", orange: "Orange", red: "Rouge", gray: "Gris", brown: "Brun" };

export const BLOCK_STYLES: { label: string; type: string; props?: Record<string, unknown> }[] = [
  { label: "Texte", type: "paragraph" }, { label: "Titre", type: "heading", props: { level: 2 } }, { label: "Sous-titre", type: "heading", props: { level: 3 } },
  { label: "Liste à puces", type: "bulletListItem" }, { label: "Liste numérotée", type: "numberedListItem" }, { label: "Liste de tâches", type: "checkListItem" },
  { label: "Encadré", type: "callout" }, { label: "Citation", type: "quote" }, { label: "Dépliant", type: "toggleListItem" }, { label: "Code", type: "codeBlock" },
];

type AnyBlock = { id: string; type: string; props?: Record<string, unknown>; content?: unknown; children?: unknown[] };

export function duplicateBlock(editor: CampussEditor, block: AnyBlock) {
  const strip = (b: AnyBlock): Record<string, unknown> => ({ type: b.type, props: b.props, content: b.content, children: (b.children as AnyBlock[] | undefined)?.map(strip) });
  editor.insertBlocks([strip(block) as never], block.id, "after");
}

/**
 * Une seule poignée, petite, à gauche du bloc survolé : glisser pour déplacer, cliquer pour le menu du bloc.
 * Le + n'existe que sur une ligne vide où se trouve le curseur, au même endroit.
 */
export function BlockHandle() {
  const editor = useBlockNoteEditor() as unknown as CampussEditor;
  const sideMenu = useExtension(SideMenuExtension);
  const suggestions = useExtension(SuggestionMenu);
  const block = useExtensionState(SideMenuExtension, { selector: (state) => state?.block }) as AnyBlock | undefined;
  const [, refresh] = useState(0);
  useEditorSelectionChange(() => refresh((n) => n + 1), editor as never);
  if (!block) return null;
  const empty = block.type === "paragraph" && Array.isArray(block.content) && block.content.length === 0;
  const focused = editor.isFocused() && editor.getTextCursorPosition().block.id === block.id;
  if (empty && focused) return (
    <button type="button" aria-label="Insérer un bloc" onClick={() => { editor.setTextCursorPosition(block.id); suggestions.openSuggestionMenu("/"); }}
      className="block-handle flex h-6 w-[18px] items-center justify-center rounded-sm text-muted-foreground hover-ok:bg-muted hover-ok:text-foreground">
      <Icon icon={IconAdd} size={16} className="size-3.5" strokeWidth={2} />
    </button>
  );
  const update = (patch: Record<string, unknown>) => { editor.updateBlock(block.id, patch as never); editor.focus(); };
  return (
    <DropdownMenu onOpenChange={(open) => (open ? sideMenu.freezeMenu() : sideMenu.unfreezeMenu())}>
      <DropdownMenuTrigger aria-label="Déplacer ou modifier le bloc" draggable
        onDragStart={(event) => sideMenu.blockDragStart(event as never, block as never)} onDragEnd={() => sideMenu.blockDragEnd()}
        className="block-handle flex h-6 w-[18px] cursor-grab items-center justify-center rounded-sm text-muted-foreground active:cursor-grabbing hover-ok:bg-muted hover-ok:text-foreground data-popup-open:bg-muted">
        <Icon icon={IconDragHandle} size={16} className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="left" align="start" className="w-56">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><Icon icon={IconRefresh} size={16} />Transformer</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            {BLOCK_STYLES.map((s) => <DropdownMenuItem key={s.label} onClick={() => update({ type: s.type, props: s.props ?? {} })}>{s.label}</DropdownMenuItem>)}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><Icon icon={IconPalette} size={16} />Couleur</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            {COLORS.filter((c) => c !== "brown").map((c) => <DropdownMenuItem key={c} onClick={() => update({ props: { textColor: c } })}><span className={cn(`tc-${c}`, "font-semibold")}>A</span>{COLOR_LABELS[c]}</DropdownMenuItem>)}
            <DropdownMenuSeparator />
            {COLORS.filter((c) => !["brown", "gray", "red"].includes(c)).map((c) => <DropdownMenuItem key={`bg-${c}`} onClick={() => update({ props: { backgroundColor: c } })}><mark className={`hl-${c} rounded-sm px-1`}>A</mark>Fond {COLOR_LABELS[c].toLowerCase()}</DropdownMenuItem>)}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => update({ props: { textColor: "default", backgroundColor: "default" } })}>Retirer la couleur</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => duplicateBlock(editor, block)}><Icon icon={IconCopy} size={16} />Dupliquer<DropdownMenuShortcut>Ctrl D</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem onClick={() => { editor.setTextCursorPosition(block.id); editor.moveBlocksUp(); }}><Icon icon={IconUiArrowUp01} size={16} />Monter<DropdownMenuShortcut>Ctrl ⇧ ↑</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem onClick={() => { editor.setTextCursorPosition(block.id); editor.moveBlocksDown(); }}><Icon icon={IconUiArrowDown01} size={16} />Descendre<DropdownMenuShortcut>Ctrl ⇧ ↓</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => editor.removeBlocks([block.id])}><Icon icon={IconDelete} size={16} />Supprimer</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
