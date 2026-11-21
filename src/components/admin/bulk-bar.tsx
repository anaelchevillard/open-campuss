"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { IconClose } from "@/lib/icons";

/** Barre d'actions groupées : monte de 12 px en 180 ms, collée en bas au-dessus de la barre d'onglets. */
export function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-offset)+0.5rem)] z-(--z-sticky) flex justify-center px-4 lg:pl-[calc(var(--sidebar-width,0px)+1rem)]">
      <div role="toolbar" aria-label="Actions sur la sélection" className="admin-bulk pointer-events-auto flex max-w-full flex-wrap items-center gap-1 rounded-xl bg-popover px-2 py-1.5 shadow-md">
        <Button size="sm" variant="ghost" onClick={onClear} aria-label="Vider la sélection"><Icon icon={IconClose} size={16} /></Button>
        <span className="px-1 text-sm font-semibold tabular-nums">{count} sélectionné{count > 1 ? "s" : ""}</span>
        {children}
      </div>
    </div>
  );
}
