import type { ReactNode } from "react";
import { cn } from "cn";
import { Icon } from "@/components/icon";
import { IconAi, type IconData } from "@/lib/icons";

/** État vide : une icône, une phrase, une action. Variante `ai` quand l'action proposée passe par Campuss IA. */
export function EmptyState({ icon, title, description, action, variant = "default", className }: { icon?: IconData; title: string; description?: ReactNode; action?: ReactNode; variant?: "default" | "ai"; className?: string }) {
  const ai = variant === "ai";
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-xl px-6 py-10 text-center", ai ? "ai-border ai-surface" : "bg-card shadow-xs", className)}>
      <span className={cn("flex size-12 items-center justify-center rounded-xl", ai ? "bg-card text-[var(--ai-3)]" : "bg-brand-tint text-brand-text")}>
        <Icon icon={icon ?? IconAi} size={24} />
      </span>
      <div className="grid max-w-sm gap-1">
        <p className="font-semibold text-balance">{title}</p>
        {description && <p className="text-sm text-pretty text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
