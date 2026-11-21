"use client";

import { useRef, type MouseEvent as ReactMouseEvent, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "cn";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useCoarsePointer, useMedia } from "@/hooks/use-media";

export type ResponsiveSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Titre lu par les lecteurs d'écran seulement */
  hideTitle?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Largeur du dialogue sur ordinateur */
  size?: "sm" | "md" | "lg";
};

const SIZES = { sm: "sm:max-w-sm", md: "sm:max-w-[28rem]", lg: "sm:max-w-2xl" };

/**
 * Dialogue centré à la souris sur grand écran, feuille basse sinon (poignée, glisser pour fermer).
 * Le retour système ferme la surface ; le focus revient au déclencheur.
 */
export function ResponsiveSheet({ open, onOpenChange, title, description, hideTitle, children, footer, className, size = "md" }: ResponsiveSheetProps) {
  const coarse = useCoarsePointer();
  const wide = useMedia("(min-width: 768px)");
  const { markNavigating } = useBackToClose(open, () => onOpenChange(false));
  // Un lien suivi depuis la feuille remplace son entrée d'historique : pas de retour en arrière à la fermeture
  const onClickCapture = (event: ReactMouseEvent) => { if ((event.target as HTMLElement).closest("a[href]")) markNavigating(); };
  const asDialog = wide && !coarse;

  if (asDialog) return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(SIZES[size], className)}>
        <DialogHeader className={hideTitle ? "sr-only" : undefined}>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div onClickCapture={onClickCapture} className="contents">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
      </DialogContent>
    </Dialog>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false} className={cn("gap-0 px-4", className)}>
        <DragToClose onClose={() => onOpenChange(false)} />
        <SheetHeader className={cn("px-0 pt-1 pb-3", hideTitle && "sr-only")}>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div onClickCapture={onClickCapture} className="-mx-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2">{children}</div>
        {footer && <div className="flex flex-col gap-2 pt-3">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}

/** Poignée : on tire la feuille vers le bas, elle se ferme au-delà de 100 px ou d'un geste rapide. */
function DragToClose({ onClose }: { onClose: () => void }) {
  const start = useRef<{ y: number; t: number } | null>(null);
  const sheetOf = (el: HTMLElement) => el.closest<HTMLElement>("[data-slot=sheet-content]");
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const dy = Math.max(0, event.clientY - start.current.y);
    const sheet = sheetOf(event.currentTarget);
    if (sheet) { sheet.style.transitionDuration = "0ms"; sheet.style.translate = `0 ${dy}px`; }
  };
  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const dy = event.clientY - start.current.y;
    const speed = dy / Math.max(1, performance.now() - start.current.t);
    start.current = null;
    const sheet = sheetOf(event.currentTarget);
    if (sheet) { sheet.style.transitionDuration = ""; sheet.style.translate = ""; }
    if (dy > 100 || speed > 0.5) onClose();
  };
  return (
    <div
      aria-hidden
      className="-mx-4 flex h-6 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
      onPointerDown={(event) => { start.current = { y: event.clientY, t: performance.now() }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span className="h-1 w-9 rounded-full bg-input/60" />
    </div>
  );
}
