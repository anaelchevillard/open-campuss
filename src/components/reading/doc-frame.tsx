"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "cn";
import { Icon } from "@/components/icon";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCoarsePointer } from "@/hooks/use-media";
import { IconToc } from "@/lib/icons";
import { FRAME, tocMode } from "@/lib/reading-layout";

const noop = () => () => {};

export type TocItem = { id: string; text: string; depth: number };
export type TocExtra = { href: string; label: string };

export { FRAME };

type FrameState = { width: number; coarse: boolean; notes: number; setNotes: (count: number) => void };
const FrameContext = createContext<FrameState>({ width: 0, coarse: false, notes: 0, setNotes: () => undefined });

/** Largeur du conteneur de lecture et nombre de notes, pour la couche d'annotations. */
export const useDocFrame = () => useContext(FrameContext);

const targetOf = (id: string) => document.getElementById(id) ?? document.querySelector(`[data-id="${CSS.escape(id)}"]`);

/**
 * Le titre en cours suit la lecture. Fait main plutôt qu'avec Scrollspy (ReUI) : celui-ci mesure `offsetTop`,
 * faux dans la couche d'annotations (positionnée), et ne connaît que `id` alors que l'éditeur marque ses titres par `data-id`.
 */
export function useCurrentHeading(items: TocItem[]) {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    if (!items.length) return;
    let frame = 0;
    const read = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        let found: string | null = null;
        for (const item of items) {
          const el = targetOf(item.id);
          if (!el) continue;
          if (el.getBoundingClientRect().top < 160) found = item.id; else break;
        }
        setCurrent(found);
      });
    };
    read();
    addEventListener("scroll", read, { passive: true });
    return () => { cancelAnimationFrame(frame); removeEventListener("scroll", read); };
  }, [items]);
  return current;
}

export function goToHeading(id: string) {
  targetOf(id)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  history.replaceState(null, "", `#${id}`);
}

export function TocList({ items, extras = [], onPick, className }: { items: TocItem[]; extras?: TocExtra[]; onPick?: () => void; className?: string }) {
  const current = useCurrentHeading(items);
  return (
    <div className={className}>
      <ul className="doc-toc-list">
        {items.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`} data-current={current === item.id || undefined} data-depth={item.depth} aria-current={current === item.id ? "location" : undefined}
              onClick={(event) => { event.preventDefault(); goToHeading(item.id); onPick?.(); }}>{item.text}</a>
          </li>
        ))}
      </ul>
      {extras.length > 0 && (
        <ul className="mt-4 grid gap-1 border-t border-border pt-3 text-sm">
          {extras.map((extra) => <li key={extra.href}><a className="text-muted-foreground hover:text-foreground" href={extra.href} onClick={() => onPick?.()}>{extra.label}</a></li>)}
        </ul>
      )}
    </div>
  );
}

/** Pourcentage lu, pour le sommaire en feuille. */
function useReadPercent() {
  const [percent, setPercent] = useState(0);
  useEffect(() => {
    const read = () => { const max = document.documentElement.scrollHeight - innerHeight; setPercent(max > 0 ? Math.min(100, Math.round((scrollY / max) * 100)) : 100); };
    read();
    addEventListener("scroll", read, { passive: true });
    return () => removeEventListener("scroll", read);
  }, []);
  return percent;
}

/** Sommaire en feuille basse : titre courant visible, pourcentage lu. */
export function TocSheet({ open, onOpenChange, items, extras }: { open: boolean; onOpenChange: (open: boolean) => void; items: TocItem[]; extras?: TocExtra[] }) {
  const percent = useReadPercent();
  const current = useCurrentHeading(items);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => list.current?.querySelector("[data-current]")?.scrollIntoView({ block: "center" }), 60);
    return () => clearTimeout(timer);
  }, [open, current]);
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title="Dans ce cours" description={`${percent} % lu`} size="sm" className="max-h-[60dvh]">
      <div ref={list}><TocList items={items} extras={extras} onPick={() => onOpenChange(false)} /></div>
    </ResponsiveSheet>
  );
}

function Rail({ items, extras }: { items: TocItem[]; extras: TocExtra[] }) {
  const current = useCurrentHeading(items);
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger openOnHover delay={450} aria-label="Dans ce cours" className="doc-rail outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        {items.map((item) => <span key={item.id} data-depth={item.depth} data-current={current === item.id || undefined} />)}
      </PopoverTrigger>
      <PopoverContent side="left" align="start" sideOffset={8} className="max-h-[70dvh] w-64 overflow-y-auto">
        <nav aria-label="Sommaire du cours">
          <p className="mb-2 text-sm font-semibold">Dans ce cours</p>
          <TocList items={items} extras={extras} onPick={() => setOpen(false)} />
        </nav>
      </PopoverContent>
    </Popover>
  );
}

function FloatingToc({ items, extras }: { items: TocItem[]; extras: TocExtra[] }) {
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return null;
  // Hors de la grille : `.doc-shell` est un conteneur de requête, un élément fixe y serait mal placé
  return createPortal(
    <>
      <Button variant="outline" size="icon" aria-label="Dans ce cours" onClick={() => setOpen(true)}
        className="fixed right-4 z-(--z-sticky) size-11 rounded-full bg-popover shadow-md bottom-[calc(var(--bottom-offset)+1rem)]">
        <Icon icon={IconToc} />
      </Button>
      <TocSheet open={open} onOpenChange={setOpen} items={items} extras={extras} />
    </>,
    document.body,
  );
}

/**
 * La grille à trois zones, la même pour lire, écrire, les actualités et /corriger : le texte au centre,
 * le sommaire et les notes à droite. Rien de ce qui apparaît à droite ne déplace le texte.
 */
export function DocFrame({ items = [], extras = [], stickyTop, gutter, aside, children, className }: { items?: TocItem[]; extras?: TocExtra[]; stickyTop?: string; gutter?: boolean; aside?: ReactNode; children: ReactNode; className?: string }) {
  const shell = useRef<HTMLDivElement>(null);
  const coarse = useCoarsePointer();
  const [width, setWidth] = useState(0);
  const [notes, setNotes] = useState(0);
  useEffect(() => {
    const el = shell.current;
    if (!el) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width / rem));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const mode = tocMode(width, coarse, notes, items.length + (extras.length ? 1 : 0));
  const value = useMemo(() => ({ width, coarse, notes, setNotes }), [width, coarse, notes]);
  const style = stickyTop ? ({ "--sticky-top": stickyTop } as CSSProperties) : undefined;
  return (
    <FrameContext.Provider value={value}>
      <div ref={shell} className={cn("doc-shell", className)} style={style} data-notes={notes || undefined}>
        <div className="doc-grid" data-gutter={gutter || notes > 0 || undefined}>
          <div className="doc-main">{children}</div>
          <aside className="doc-aside" aria-label="Autour du texte">
            {aside}
            {(mode === "list" || mode === "rail") && (
              <div key={mode} className="doc-toc doc-toc-swap" data-mode={mode} data-after-notes={(mode === "list" && notes > 0) || undefined}>
                {mode === "list"
                  ? <nav aria-label="Sommaire du cours"><p className="mb-2 text-sm font-semibold">Dans ce cours</p><TocList items={items} extras={extras} /></nav>
                  : <Rail items={items} extras={extras} />}
              </div>
            )}
          </aside>
        </div>
        {mode === "fab" && <FloatingToc items={items} extras={extras} />}
      </div>
    </FrameContext.Provider>
  );
}
