"use client";

import type { ComponentProps } from "react";
import { cn } from "cn";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { useAiAnimationSlot } from "@/hooks/use-ai-animation-slot";
import { IconAi, type IconData } from "@/lib/icons";

type AiButtonProps = Omit<ComponentProps<typeof Button>, "variant"> & {
  /** Icône de l'action (DESIGN.md §6) ; l'étincelle par défaut */
  icon?: IconData;
  /** Génération en cours : rotation rapide, libellé qui scintille */
  busy?: boolean;
};

/** Bouton Campuss IA : bordure dégradée fixe, lueur et rotation au survol, rotation rapide pendant le travail. */
export function AiButton({ icon = IconAi, busy, className, children, ...props }: AiButtonProps) {
  const [ref, still] = useAiAnimationSlot<HTMLButtonElement>(busy);
  return (
    <Button
      {...props}
      ref={ref}
      data-still={still}
      variant="outline"
      data-animate=""
      data-busy={busy ? "" : undefined}
      aria-busy={busy || undefined}
      className={cn("ai-border ai-glow hover:bg-transparent", className)}
    >
      <Icon icon={icon} size={16} className={cn("ai-spark", busy ? "text-muted-foreground" : "text-[var(--ai-3)]")} />
      <span className={busy ? "ai-text-shimmer" : "ai-text"}>{children}</span>
    </Button>
  );
}
