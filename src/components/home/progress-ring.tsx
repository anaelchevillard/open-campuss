"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "cn";

/** Anneau qui se remplit à l'arrivée (600 ms) ; instantané en mouvement réduit. */
export function ProgressRing({ value, size = 64, children, label, className }: { value: number; size?: number; children?: ReactNode; label: string; className?: string }) {
  const reduce = useReducedMotion();
  const stroke = 6;
  const r = (size - stroke) / 2;
  const clamped = Math.max(0, Math.min(100, value)) / 100;
  return (
    <span role="img" aria-label={label} className={cn("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" className="stroke-primary"
          initial={{ pathLength: reduce ? clamped : 0 }} animate={{ pathLength: clamped }} transition={{ duration: reduce ? 0 : 0.6, ease: [0.22, 1, 0.36, 1], delay: reduce ? 0 : 0.15 }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums">{children}</span>
    </span>
  );
}

/** Coche tracée (stroke-dashoffset), pour une étape faite. */
export function DrawnCheck({ done, className }: { done: boolean; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-(--dur-slow)", done ? "border-success bg-success text-white dark:text-background" : "border-input", className)} aria-hidden>
      {done && (
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduce ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }} />
        </svg>
      )}
    </span>
  );
}
