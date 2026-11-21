"use client";

import { useState } from "react";
import { toggleFavorite } from "@/app/actions/favorites";
import { Icon } from "@/components/icon";
import { IconFavorite } from "@/lib/icons";
import { toastError, toastUndo } from "@/lib/toast";
import { cn } from "cn";

/** Étoile Favori : mise à jour tout de suite, « Annuler » pendant 6 s, cible de 44 px hors du lien de la carte. */
export function FavoriteStar({ docId, initial, title, className }: { docId: string; initial: boolean; title?: string; className?: string }) {
  const [on, setOn] = useState(initial);
  const [bump, setBump] = useState(0);
  const flip = async (next: boolean, undoable: boolean) => {
    setOn(next);
    if (next) setBump((b) => b + 1);
    try {
      const saved = await toggleFavorite(docId);
      if (saved !== next) setOn(saved);
      if (undoable) toastUndo(saved ? "Ajouté aux favoris" : "Retiré des favoris", () => void flip(!saved, false));
    } catch {
      setOn(!next);
      toastError("Le favori n’a pas été enregistré");
    }
  };
  return (
    <button type="button" aria-pressed={on} aria-label={on ? `Retirer ${title ?? "ce cours"} des favoris` : `Ajouter ${title ?? "ce cours"} aux favoris`}
      onClick={() => void flip(!on, true)}
      className={cn("relative z-10 flex size-11 items-center justify-center rounded-full transition-colors hover:bg-muted", on ? "text-brand-text" : "text-muted-foreground", className)}>
      <Icon key={bump} icon={IconFavorite} filled={on} className={on && bump ? "pop" : undefined} />
    </button>
  );
}
