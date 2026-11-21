"use client";

import { useId } from "react";
import { savePrefs } from "@/app/actions/social";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { applyPrefClasses, prefsFromClasses, type Prefs } from "@/lib/prefs";
import { SettingsGroup, SwitchRow, useDraft } from "./autosave";

const INTERFACE_KEYS = ["compact", "reduceMotion", "fixedBars", "shortcuts", "othersStyles"] as const;
const sameInterface = (a: Prefs, b: Prefs) => INTERFACE_KEYS.every((key) => a[key] === b[key]);

/** Réglages de l'interface hors lecture : densité, mouvement, barres, styles des autres. Aperçu tout de suite, gardés à « Enregistrer ». */
export function InterfaceSettings({ initial }: { initial: Prefs }) {
  const id = useId();
  const [prefs, setPrefs] = useDraft("interface", initial, async (next) => {
    await savePrefs(Object.fromEntries(INTERFACE_KEYS.map((key) => [key, next[key]])) as Partial<Prefs>);
    return { ok: true as const };
  }, { same: sameInterface, onApply: (next) => applyPrefClasses(document.documentElement, { ...readPage(), ...pick(next) }) });
  const change = (patch: Partial<Prefs>) => setPrefs({ ...prefs, ...patch });
  return (
    <>
      <SettingsGroup id="interface" title="Interface">
        <SwitchRow id={`${id}-compact`} label="Mode compact" description="Listes plus denses" checked={Boolean(prefs.compact)} onChange={(v) => change({ compact: v || undefined })} />
        <SwitchRow id={`${id}-motion`} label="Réduire les animations" description="Les fondus restent, les déplacements s’arrêtent" checked={Boolean(prefs.reduceMotion)} onChange={(v) => change({ reduceMotion: v || undefined })} />
        <SwitchRow id={`${id}-bars`} label="Barres toujours visibles" description="Elles ne se cachent plus au défilement" checked={Boolean(prefs.fixedBars)} onChange={(v) => change({ fixedBars: v || undefined })} />
        <SwitchRow id={`${id}-keys`} label="Raccourcis à une touche" description="J, K, A… dans les files de relecture" checked={prefs.shortcuts !== false} onChange={(v) => change({ shortcuts: v ? undefined : false })} />
      </SettingsGroup>

      <SettingsGroup id="autres" title="Styles des autres" description="Polices, couleurs et effets choisis par les autres">
        <ToggleGroup aria-label="Styles des autres" variant="outline" spacing={0} className="w-full" value={[prefs.othersStyles ?? "on"]}
          onValueChange={(values: string[]) => { const v = values[0]; if (v) change({ othersStyles: v === "on" ? undefined : v as "plain" | "off" }); }}>
          {[{ value: "on", label: "Affichés" }, { value: "plain", label: "Sobres" }, { value: "off", label: "Masqués" }].map((o) => (
            <ToggleGroupItem key={o.value} value={o.value} className="min-h-9 flex-1 aria-pressed:bg-brand-tint aria-pressed:font-semibold aria-pressed:text-brand-text coarse:min-h-11">{o.label}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </SettingsGroup>
    </>
  );
}

/** Ce que la page affiche déjà (lecture comprise) : l'aperçu de l'interface ne touche pas au reste. */
const readPage = (): Prefs => prefsFromClasses(document.documentElement);
const pick = (prefs: Prefs): Partial<Prefs> => Object.fromEntries(INTERFACE_KEYS.map((key) => [key, prefs[key]]));
