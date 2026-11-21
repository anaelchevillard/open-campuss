"use client";

import type { Prefs } from "@/lib/prefs";
import { ReadingControls } from "@/components/reading-settings";
import { useState } from "react";
import { savePrefs } from "@/app/actions/social";
import { Switch } from "@/components/ui/switch";

/** Version courte pour l'accueil d'un nouveau compte : lecture et mouvement. Paramètres › Affichage a tout le reste. */
export function DisplaySettings({ initial }: { initial: Prefs }) {
  const [reduce, setReduce] = useState(Boolean(initial.reduceMotion));
  return (
    <div className="grid gap-5">
      <ReadingControls initial={initial} />
      <label className="flex min-h-8 cursor-pointer items-center justify-between gap-4 text-sm coarse:min-h-11">
        Réduire les animations
        <Switch checked={reduce} onCheckedChange={(value) => {
          setReduce(value);
          document.documentElement.classList.toggle("reduce-motion", value);
          void savePrefs({ reduceMotion: value || undefined });
        }} />
      </label>
    </div>
  );
}
