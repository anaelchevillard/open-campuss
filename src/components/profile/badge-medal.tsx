import { cn } from "cn";
import { Icon } from "@/components/icon";
import type { CSSProperties } from "react";
import { badgeColors, RARITIES, type BadgeIcon, type Rarity } from "@/lib/badges";
import {
  IconArchive, IconCards, IconCheckList, IconDuel, IconEdit, IconFavorite, IconFlag, IconFriends, IconGrid, IconHeart, IconIdCard,
  IconLocked, IconNote, IconQuiz, IconSecurity, IconStreak, IconSuccess, IconThanks, IconToFix, IconTogether, type IconData,
} from "@/lib/icons";

export const BADGE_ICONS: Record<BadgeIcon, IconData> = {
  carte: IconIdCard, pionnier: IconFlag, plume: IconEdit, fiche: IconCheckList, archive: IconArchive, matieres: IconGrid, merci: IconThanks,
  coeur: IconHeart, revise: IconSuccess, sentinelle: IconSecurity, serie: IconStreak, cartes: IconCards, partiel: IconQuiz, ami: IconFriends,
  groupe: IconTogether, defi: IconDuel, note: IconNote, etoile: IconFavorite, correcteur: IconToFix,
};

// Contours : rond (commun), hexagone (rare, épique), étoile (légendaire), écusson (spécial), dans une boîte de 48
const SHAPES = {
  rond: "M24 3a21 21 0 1 1 0 42a21 21 0 1 1 0-42z",
  hexagone: "M24 2.5l18.6 10.75v21.5L24 45.5L5.4 34.75v-21.5z",
  etoile: "M24 2l5.2 6.6l8.3-1.3l1.3 8.3l6.6 5.2l-4.4 7.2l2.3 8l-8 2.3l-4.1 7.4l-7.2-3.8l-7.2 3.8l-4.1-7.4l-8-2.3l2.3-8l-4.4-7.2l6.6-5.2l1.3-8.3l8.3 1.3z",
  ecusson: "M24 2.5l18 6.5v14c0 11-7.6 18.6-18 22.5C13.6 41.6 6 34 6 23V9z",
};

/**
 * Médaille d'un badge : sa couleur propre (`hue`), la forme du contour selon la rareté et (ailleurs) le mot de la rareté.
 * Sans teinte, la couleur de la rareté. Verrouillé : gris à 40 % et cadenas.
 */
export function BadgeMedal({ icon, rarity, hue, locked, size = 48, className }: { icon: BadgeIcon; rarity: Rarity; hue?: number; locked?: boolean; size?: 16 | 24 | 32 | 48 | 72; className?: string }) {
  const shape = SHAPES[RARITIES[rarity].shape];
  const iconSize = size >= 72 ? 32 : size >= 48 ? 24 : size >= 32 ? 16 : 16;
  return (
    <span data-rarity={rarity} aria-hidden className={cn("relative inline-flex shrink-0 items-center justify-center [--b:var(--r)] [--b-tint:var(--r-tint)]", locked && "opacity-40 grayscale", className)}
      style={{ width: size, height: size, ...(hue === undefined ? {} : badgeColors(hue)) } as CSSProperties}>
      <svg viewBox="0 0 48 48" className="absolute inset-0 size-full overflow-visible">
        <path d={shape} fill="var(--b-tint)" stroke="var(--b)" strokeWidth={size <= 24 ? 4 : 2.5} strokeLinejoin="round" />
      </svg>
      {size > 16 && <span className="relative text-(--b)"><Icon icon={BADGE_ICONS[icon]} size={iconSize as 16 | 24 | 32} strokeWidth={size >= 72 ? 1.75 : undefined} /></span>}
      {locked && size >= 32 && (
        <span className="absolute -right-1 -bottom-1 inline-flex size-5 items-center justify-center rounded-full bg-card text-muted-foreground shadow-xs"><Icon icon={IconLocked} size={16} /></span>
      )}
    </span>
  );
}
