import type { ReactNode } from "react";
import { cn } from "cn";
import { AI_NOTICE } from "@/lib/ai-ui";

/** Contenu généré : texte normal sur fond teinté, bordure fine, mention « à vérifier » toujours visible. */
export function AiSurface({ children, footer, className, notice = true }: { children: ReactNode; footer?: ReactNode; className?: string; notice?: boolean }) {
  return (
    <div className={cn("ai-border ai-surface p-4 text-foreground", className)}>
      {children}
      {(notice || footer) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          {notice && <span>{AI_NOTICE}</span>}
          {footer}
        </div>
      )}
    </div>
  );
}
