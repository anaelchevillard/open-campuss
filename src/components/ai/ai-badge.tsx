import { cn } from "cn";
import { Icon } from "@/components/icon";
import { IconAi } from "@/lib/icons";

/** « Campuss IA » : marque d'un contenu ou d'un réglage IA. Statique. */
export function AiBadge({ className, label = "Campuss IA" }: { className?: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", className)}>
      <Icon icon={IconAi} size={16} className="text-[var(--ai-3)]" />
      <span className="ai-text">{label}</span>
    </span>
  );
}
