"use client";

import { useState, type ReactNode } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** Deux couches (contributions, révision), dessinées par le serveur ; on bascule de l'une à l'autre. */
export function ActivityLayers({ contributions, study, summaries }: { contributions: ReactNode; study: ReactNode | null; summaries: [string, string | null] }) {
  const [layer, setLayer] = useState<"contributions" | "study">("contributions");
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{layer === "study" && summaries[1] ? summaries[1] : summaries[0]}</p>
        {study && (
          <ToggleGroup aria-label="Couche du graphe" variant="outline" size="sm" spacing={0} value={[layer]} onValueChange={(values: string[]) => values[0] && setLayer(values[0] as "contributions" | "study")}>
            <ToggleGroupItem value="contributions" className="aria-pressed:bg-brand-tint aria-pressed:font-semibold aria-pressed:text-brand-text coarse:min-h-11">Contributions</ToggleGroupItem>
            <ToggleGroupItem value="study" className="aria-pressed:bg-brand-tint aria-pressed:font-semibold aria-pressed:text-brand-text coarse:min-h-11">Révision</ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>
      <div key={layer} className="animate-[fade_200ms_ease-out]">{layer === "study" && study ? study : contributions}</div>
    </div>
  );
}
