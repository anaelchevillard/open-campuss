import type { ReactNode } from "react";
import { cn } from "cn";

/** Barre d'actions collée en bas, au-dessus de la barre d'onglets au téléphone. */
export function StickyActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="pointer-events-none sticky bottom-safe z-(--z-sticky) mt-6 flex justify-center">
      <div className={cn("pointer-events-auto flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-xl bg-popover px-3 py-2 shadow-md motion-ok:animate-rise", className)}>{children}</div>
    </div>
  );
}
