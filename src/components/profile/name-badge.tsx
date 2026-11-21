"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BadgeMedal } from "@/components/profile/badge-medal";
import { badgeOf, RARITIES } from "@/lib/badges";

/**
 * Badge choisi à côté du nom : à la taille du texte, avec son pictogramme (à 16 px il n'en restait qu'un rond vide).
 * Alignement : `middle` centre la médaille sur la hauteur d'x (0,24 em au-dessus de la ligne de base) ;
 * on la remonte de 0,09 em pour la centrer sur les capitales (hauteur de capitale de Source Sans 3 : 0,66 em),
 * quelle que soit la taille du nom. Les polices de nom ont la même hauteur d'x (name-fonts.css).
 */
export function NameBadge({ id }: { id: string }) {
  const badge = badgeOf(id);
  if (!badge) return null;
  return (
    <Popover>
      <PopoverTrigger className="user-name-badge relative -top-[0.09em] inline-flex align-middle after:absolute after:-inset-3 rounded-sm focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Badge ${badge.name}`}>
        <BadgeMedal icon={badge.icon} rarity={badge.rarity} hue={badge.hue} size={24} />
      </PopoverTrigger>
      <PopoverContent side="top" className="flex w-64 items-center gap-3 p-3">
        <BadgeMedal icon={badge.icon} rarity={badge.rarity} hue={badge.hue} size={32} />
        <span className="grid gap-0.5 text-sm">
          <span className="font-semibold">{badge.name}</span>
          <span className="text-muted-foreground">{RARITIES[badge.rarity].label} · {badge.hint}</span>
        </span>
      </PopoverContent>
    </Popover>
  );
}
