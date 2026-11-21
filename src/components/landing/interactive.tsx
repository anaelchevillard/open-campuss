"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "cn";
import { Icon } from "@/components/icon";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AI_NOTICE } from "@/lib/ai-ui";
import { IconLaptop, IconPhone, IconTablet } from "@/lib/icons";

export type Demo = { value: string; label: string; text: string; visual: ReactNode };

/**
 * Démonstrations de Campuss IA, sur un simple filet : ni bordure en dégradé ni badge sur la présentation.
 * La mention « Généré par Campuss IA, à vérifier » reste.
 */
export function AiDemos({ demos, privacy }: { demos: Demo[]; privacy: ReactNode }) {
  const [value, setValue] = useState(demos[0]?.value ?? "");
  const current = demos.find((d) => d.value === value) ?? demos[0];
  if (!current) return null;
  return (
    <div className="border-y-2 border-[var(--lp-rule)] py-6 md:py-8">
      <SegmentedTabs label="Démonstrations de Campuss IA" items={demos.map(({ value, label }) => ({ value, label }))} value={current.value} onValueChange={setValue} />
      <div className="mt-8 grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
        <div>
          <p className="lp-h3 max-w-[24ch] text-balance">{current.text}</p>
          <p className="mt-4 text-xs text-muted-foreground">{AI_NOTICE}</p>
        </div>
        <div key={current.value} className="lp-fade mx-auto w-full max-w-60">{current.visual}</div>
      </div>
      <div className="mt-8 border-t border-border pt-4 text-sm text-muted-foreground">{privacy}</div>
    </div>
  );
}

const PHONE_QUERY = "(max-width: 767px)";
const subscribe = (cb: () => void) => { const mq = window.matchMedia(PHONE_QUERY); mq.addEventListener("change", cb); return () => mq.removeEventListener("change", cb); };

/** Une capture par appareil, en fondu croisé. Avant tout choix, le CSS montre le téléphone au téléphone : aucun saut. */
export function Devices({ panels }: { panels: { value: "phone" | "tablet" | "laptop"; label: string; text: string; visual: ReactNode }[] }) {
  const isPhone = useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches, () => false);
  const [chosen, setChosen] = useState<string | null>(null);
  const active = chosen ?? (isPhone ? "phone" : "laptop");
  const icons = { phone: IconPhone, tablet: IconTablet, laptop: IconLaptop };
  const shown = (value: string) => chosen ? value === chosen : value === "phone" ? "max-md:opacity-100 max-md:visible" : value === "laptop" ? "md:opacity-100 md:visible" : false;
  return (
    <div>
      <ToggleGroup aria-label="Appareil" variant="outline" spacing={0} value={[active]} onValueChange={(values: string[]) => values[0] && setChosen(values[0])}>
        {panels.map((p) => <ToggleGroupItem key={p.value} value={p.value} className="h-11 gap-2 px-3"><Icon icon={icons[p.value]} />{p.label}</ToggleGroupItem>)}
      </ToggleGroup>
      <div className="mt-6 grid [&>*]:col-start-1 [&>*]:row-start-1">
        {panels.map((p) => {
          const on = shown(p.value);
          return (
            <figure key={p.value} aria-hidden={p.value !== active} className={cn("invisible opacity-0 transition-[opacity,visibility] duration-200", on === true && "visible opacity-100", typeof on === "string" && on)}>
              <figcaption className="mb-4 max-w-[52ch] text-lg">{p.text}</figcaption>
              {p.visual}
            </figure>
          );
        })}
      </div>
    </div>
  );
}
