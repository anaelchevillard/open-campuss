"use client";

import { saveLevel } from "@/app/actions/social";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDraft } from "./autosave";

/** Année ouverte par défaut : enregistrée avec le reste de la page. */
export function LevelChoice({ level }: { level: number }) {
  const [value, setValue] = useDraft("level", String(level), (v) => saveLevel(Number(v)));
  return (
    <div className="grid gap-2">
      <span className="text-sm font-semibold">Année affichée à l’ouverture</span>
      <ToggleGroup aria-label="Année" variant="outline" spacing={0} className="w-full sm:w-72" value={[value]}
        onValueChange={(values: string[]) => { const v = values[0]; if (v) setValue(v); }}>
        {["1", "2", "3"].map((l) => <ToggleGroupItem key={l} value={l} className="min-h-9 flex-1 aria-pressed:bg-brand-tint aria-pressed:font-semibold aria-pressed:text-brand-text coarse:min-h-11">L{l}</ToggleGroupItem>)}
      </ToggleGroup>
    </div>
  );
}
