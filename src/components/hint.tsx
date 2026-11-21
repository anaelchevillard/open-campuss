"use client";

import { useState, type ReactElement } from "react";
import { savePrefs } from "@/app/actions/social";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

/**
 * Astuce ponctuelle (8 mots au plus) posée sur un élément, montrée une seule fois puis rangée dans prefs.hints.
 * `seen` : la liste prefs.hints de la personne. Ne prend jamais le focus : la personne garde la main là où elle tape.
 */
export function Hint({ id, text, seen, children, side = "bottom" }: { id: string; text: string; seen: string[] | undefined; children: ReactElement; side?: "top" | "bottom" | "left" | "right" }) {
  const [open, setOpen] = useState(!(seen ?? []).includes(id));
  if (!open) return children;
  const close = () => {
    setOpen(false);
    void savePrefs({ hints: [...(seen ?? []).filter((h) => h !== id), id] });
  };
  return (
    <Popover open onOpenChange={(next) => { if (!next) close(); }}>
      {/* Pas un lien : l'élément enveloppé (un repère ou l'enveloppe d'un filtre) sert seulement d'ancrage à la bulle, d'où nativeButton={false} */}
      <PopoverTrigger render={children} nativeButton={false} />
      <PopoverContent side={side} initialFocus={false} finalFocus={false} className="w-auto max-w-64 flex-row items-center gap-3 bg-invert px-3 py-2 text-invert-foreground motion-ok:animate-rise">
        <span className="text-sm">{text}</span>
        <Button size="xs" variant="ghost" className="text-invert-foreground hover:bg-white/10 hover:text-invert-foreground" onClick={close}>OK</Button>
      </PopoverContent>
    </Popover>
  );
}
