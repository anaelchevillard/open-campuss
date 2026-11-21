"use client";

import { cn } from "cn";
import { useAiAnimationSlot } from "@/hooks/use-ai-animation-slot";

/** Campuss IA au travail : trois lignes qui se remplissent et un libellé qui scintille. */
export function AiWorking({ label = "Campuss IA rédige…", className, lines = 3 }: { label?: string; className?: string; lines?: number }) {
  const [ref, still] = useAiAnimationSlot<HTMLDivElement>(true);
  const widths = ["100%", "92%", "64%", "84%", "72%"];
  return (
    <div ref={ref} data-still={still} data-busy="" aria-busy="true" aria-live="polite" className={cn("ai-border ai-surface grid gap-2.5 p-4", className)}>
      <p className="ai-text-shimmer text-sm font-semibold">{label}</p>
      {Array.from({ length: lines }, (_, i) => <span key={i} aria-hidden className="ai-skeleton block h-3.5" style={{ width: widths[i % widths.length] }} />)}
    </div>
  );
}
