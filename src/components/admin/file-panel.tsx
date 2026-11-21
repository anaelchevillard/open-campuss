"use client";

import type { ReactNode } from "react";
import { useGridParams } from "@/components/admin/admin-grid";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

/** La fiche vit dans l'URL (?fiche=) : le retour système la ferme sans rien de plus. Panneau latéral de 560 px qui porte la fiche depuis la grille (220 ms à l'entrée, 160 ms à la sortie). */
export function FilePanel({ title, children }: { title: string; children: ReactNode }) {
  const { set } = useGridParams();
  const close = () => set({ fiche: null, vue: null }, false);
  return (
    <Sheet open onOpenChange={(open) => { if (!open) close(); }}>
      <SheetContent side="right" className="overflow-y-auto p-6 duration-[220ms] data-ending-style:duration-[160ms] sm:max-w-[560px]">
        <SheetTitle className="sr-only">{title}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}
