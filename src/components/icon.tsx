import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { cn } from "cn";

/** Icône Hugeicons : 16 (badge), 20 (défaut), 24 (onglets, états vides), 32 (récompenses). Décorative sauf si `label`. */
export function Icon({ icon, size = 20, strokeWidth, label, className, filled }: { icon: IconSvgElement; size?: 16 | 20 | 24 | 32; strokeWidth?: number; label?: string; className?: string; filled?: boolean }) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={strokeWidth ?? (size === 32 ? 1.5 : 1.75)}
      className={cn("shrink-0", filled && "[&_path]:fill-current", className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      focusable={false}
    />
  );
}
