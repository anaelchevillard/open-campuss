"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "cn";
import { Badge } from "@/components/reui/badge";
import { snappy } from "@/lib/motion";

export type SegmentedTab = { value: string; label: string; count?: number; href?: string };

/**
 * Onglets d'une page : indicateur qui glisse, compteur en Badge, défilement horizontal avec masque de bord au téléphone.
 * Avec `href`, chaque onglet est un lien (l'onglet vit dans l'URL).
 */
export function SegmentedTabs({ items, value, onValueChange, label, className }: { items: SegmentedTab[]; value: string; onValueChange?: (value: string) => void; label: string; className?: string }) {
  const id = useId();
  return (
    <nav aria-label={label} className={cn("-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [mask-image:linear-gradient(to_right,transparent,#000_1rem,#000_calc(100%-1rem),transparent)] md:mx-0 md:px-0 md:[mask-image:none]", className)}>
      <ul role="list" className="flex w-max gap-1 border-b border-border">
        {items.map((tab) => {
          const active = tab.value === value;
          const inner = (
            <>
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && <Badge variant={active ? "primary-light" : "secondary"} size="sm" radius="full" className="tabular-nums">{tab.count}</Badge>}
              {active && <motion.span layoutId={`tab-${id}`} transition={snappy} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-text" />}
            </>
          );
          const cls = cn("relative flex min-h-10 items-center gap-1.5 rounded-t-md px-3 text-sm font-semibold transition-colors coarse:min-h-11", active ? "text-brand-text" : "text-muted-foreground hover:text-foreground");
          return (
            <li key={tab.value}>
              {tab.href
                ? <Link href={tab.href} aria-current={active ? "page" : undefined} className={cls} scroll={false}>{inner}</Link>
                : <button type="button" aria-pressed={active} className={cls} onClick={() => onValueChange?.(tab.value)}>{inner}</button>}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
