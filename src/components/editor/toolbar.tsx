"use client";

import { useEditorChange, useEditorSelectionChange } from "@blocknote/react";
import { Fragment, useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { IconAdd, IconExpand, IconRedo, IconUndo } from "@/lib/icons";
import { cn } from "cn";
import { useEditorDoc } from "./editor-doc";
import type { CampussEditor } from "./schema";
import { BLOCK_STYLES } from "./side-menu";
import { blockCatalog } from "./slash-menu";

const TRIGGER = "flex min-h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold transition-colors hover-ok:bg-muted data-popup-open:bg-muted coarse:min-h-11";

function Tool({ label, shortcut, onClick, children }: { label: string; shortcut?: string; onClick: () => void; children: ReactNode }) {
  const button = <button type="button" aria-label={label} onMouseDown={(event) => event.preventDefault()} onClick={onClick} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover-ok:bg-muted hover-ok:text-foreground coarse:size-11">{children}</button>;
  return <Tooltip><TooltipTrigger render={button} /><TooltipContent>{label}{shortcut && <span className="ml-1.5 text-muted-foreground">{shortcut}</span>}</TooltipContent></Tooltip>;
}

/** Barre du haut, allégée : style du bloc, Insérer (le catalogue du menu « / »), Importer, Annuler, Rétablir, état. */
export function EditorToolbar({ editor, importer, status, onOcr }: { editor: CampussEditor; importer?: ReactNode; status?: ReactNode; onOcr?: () => void }) {
  const [, refresh] = useState(0);
  useEditorChange(() => refresh((n) => n + 1), editor);
  useEditorSelectionChange(() => refresh((n) => n + 1), editor);
  const current = editor.getTextCursorPosition().block as { type: string; props?: { level?: number } };
  const currentStyle = BLOCK_STYLES.find((s) => s.type === current.type && (s.props?.level === undefined || s.props.level === current.props?.level))?.label ?? "Texte";
  const setType = (type: string, props: Record<string, unknown> = {}) => { editor.updateBlock(editor.getTextCursorPosition().block, { type, props } as never); editor.focus(); };
  // À la fermeture d'un menu, le curseur revient dans le texte : on continue d'écrire sans recliquer
  const refocus = () => { editor.focus(); return false; };
  const catalog = blockCatalog(editor, { onOcr, artifact: useEditorDoc() !== null });
  const groups = [...new Set(catalog.map((i) => i.group))];
  return (
    <div role="toolbar" aria-label="Mise en page" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger aria-label="Style du paragraphe" className={TRIGGER}>{currentStyle}<Icon icon={IconExpand} size={16} className="size-3.5 text-muted-foreground" /></DropdownMenuTrigger>
        <DropdownMenuContent align="start" finalFocus={refocus} className="w-48">
          {BLOCK_STYLES.map((s) => <DropdownMenuItem key={s.label} onClick={() => setType(s.type, s.props)}>{s.label}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger aria-label="Insérer" className={TRIGGER}><Icon icon={IconAdd} size={16} />Insérer</DropdownMenuTrigger>
        <DropdownMenuContent align="start" finalFocus={refocus} className="max-h-80 w-72">
          {groups.map((group) => (
            <Fragment key={group}>
              <DropdownMenuGroup>
                <DropdownMenuLabel className={cn(group === "Campuss IA" && "ai-text")}>{group}</DropdownMenuLabel>
                {catalog.filter((i) => i.group === group).map((item) => (
                  <DropdownMenuItem key={item.key} aria-label={item.title} onClick={() => { editor.focus(); item.onItemClick(); }}>
                    <span className={cn("flex size-6 items-center justify-center rounded-md", item.ai ? "ai-border" : "bg-muted text-muted-foreground")}><Icon icon={item.glyph} size={16} /></span>
                    <span className={cn(item.ai && "ai-text font-semibold")}>{item.title}</span>
                    {item.kbd && <DropdownMenuShortcut className="coarse:hidden">{item.kbd}</DropdownMenuShortcut>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {importer}
      <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />
      <Tool label="Annuler" shortcut="Ctrl Z" onClick={() => editor.undo()}><Icon icon={IconUndo} size={16} /></Tool>
      <Tool label="Rétablir" shortcut="Ctrl ⇧ Z" onClick={() => editor.redo()}><Icon icon={IconRedo} size={16} /></Tool>
      {status}
    </div>
  );
}
