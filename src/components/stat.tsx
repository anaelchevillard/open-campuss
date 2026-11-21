import type { ReactNode } from "react";
import { cn } from "cn";

/** Le chiffre d'abord, le mot dessous. */
export function Stat({ value, label, hint, className }: { value: ReactNode; label: string; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-0.5", className)}>
      <span className="text-2xl leading-tight font-semibold tabular-nums">{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
