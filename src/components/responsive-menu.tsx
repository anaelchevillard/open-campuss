"use client";

import Link from "next/link";
import { Fragment, useState, type ReactElement } from "react";
import { cn } from "cn";
import { Icon } from "@/components/icon";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCoarsePointer } from "@/hooks/use-media";
import type { IconData } from "@/lib/icons";

export type MenuEntry = { label: string; icon?: IconData; href?: string; onSelect?: () => void; danger?: boolean; separatorBefore?: boolean };

/** Menu d'actions : liste déroulante à la souris, feuille basse au toucher, mêmes entrées. */
export function ResponsiveMenu({ trigger, items, title = "Actions", align = "end" }: { trigger: ReactElement; items: MenuEntry[]; title?: string; align?: "start" | "end" }) {
  const coarse = useCoarsePointer();
  const [open, setOpen] = useState(false);
  if (coarse) return (
    <>
      <span onClick={() => setOpen(true)} className="contents">{trigger}</span>
      <ResponsiveSheet open={open} onOpenChange={setOpen} title={title} hideTitle>
        <ul className="-mx-2 grid pb-2">
          {items.map((item) => {
            const inner = <>{item.icon && <Icon icon={item.icon} className={item.danger ? "" : "text-muted-foreground"} />}{item.label}</>;
            const cls = cn("flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-base hover:bg-muted", item.danger && "text-destructive");
            return (
              <li key={item.label} className={cn(item.separatorBefore && "mt-1 border-t border-border pt-1")}>
                {item.href
                  ? <Link href={item.href} replace className={cls} onClick={() => setOpen(false)}>{inner}</Link>
                  : <button type="button" className={cls} onClick={() => { setOpen(false); item.onSelect?.(); }}>{inner}</button>}
              </li>
            );
          })}
        </ul>
      </ResponsiveSheet>
    </>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align={align} className="min-w-48">
        {items.map((item) => (
          <Fragment key={item.label}>
            {item.separatorBefore && <DropdownMenuSeparator />}
            <DropdownMenuItem variant={item.danger ? "destructive" : "default"} onClick={item.onSelect} render={item.href ? <Link href={item.href} /> : undefined}>
              {item.icon && <Icon icon={item.icon} size={16} />}{item.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
