"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { cn } from "cn";
import { saveReadingPrefs } from "@/app/actions/social";
import { Icon } from "@/components/icon";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { useSaveScope, useStaged } from "@/components/save-guard";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCoarsePointer } from "@/hooks/use-media";
import { IconDark, IconLight, IconSystem } from "@/lib/icons";
import { applyPrefClasses, prefsFromClasses, READING_FONTS, readingOf, sameReading, type Prefs } from "@/lib/prefs";
import { toast } from "@/lib/toast";

/** Texte neutre d'aperçu ; sur un cours, un extrait du cours ouvert le remplace. */
const SAMPLE = "Lire confortablement, c’est choisir la police, la taille et l’espacement qui te conviennent. Cet aperçu change en direct.";

/** Premier paragraphe assez long du cours affiché, coupé à 160 caractères ; sinon le texte neutre. */
function useSample(course: boolean) {
  const [sample, setSample] = useState(SAMPLE);
  useEffect(() => {
    if (!course) return;
    const paragraph = [...document.querySelectorAll<HTMLElement>("article.course p")].map((p) => p.textContent?.replace(/\s+/g, " ").trim() ?? "").find((text) => text.length >= 60);
    if (!paragraph) return;
    const cut = paragraph.length > 160 ? `${paragraph.slice(0, 160).replace(/\s+\S*$/, "")}…` : paragraph;
    setSample(cut); // eslint-disable-line react-hooks/set-state-in-effect -- lu une fois dans la page à l'ouverture du panneau
  }, [course]);
  return sample;
}

/** Applique la lecture seule : le reste de la page (interface en cours de réglage) ne bouge pas. */
const applyReading = (prefs: Prefs) => applyPrefClasses(document.documentElement, { ...prefsFromClasses(document.documentElement), ...readingOf(prefs) } as Prefs);

const pageClasses = () => (typeof document === "undefined" ? {} : prefsFromClasses(document.documentElement));

/**
 * La page change tout de suite (aperçu) ; rien n'est gardé avant « Enregistrer ».
 * Enregistré sur le compte, ou dans le cookie campuss-prefs pour un visiteur.
 */
export function usePrefs(initial?: Prefs) {
  const [saved, setSaved] = useState<Prefs>(() => initial ?? pageClasses());
  const [prefs, setPrefs] = useState<Prefs>(saved);
  const [saving, start] = useTransition();
  const dirty = !sameReading(prefs, saved);
  const change = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    applyReading(next);
  };
  const save = () => new Promise<boolean>((resolve) => start(async () => {
    const ok = await saveReadingPrefs(readingOf(prefs)).then(() => true, () => false);
    if (ok) {
      setSaved(prefs);
      // La page peut être redessinée par le serveur pendant l'enregistrement : le choix fait ici reste celui affiché
      applyReading(prefs);
      toast("Réglages de lecture enregistrés");
    } else toast("L’enregistrement a échoué. Réessaie.");
    resolve(ok);
  }));
  const revert = () => { setPrefs(saved); applyReading(saved); };
  /** À l'ouverture du panneau : on repart de ce que la page affiche. */
  const reload = () => { const now = initial ? saved : pageClasses(); setSaved(now); setPrefs(now); };
  // Quitter le site avec un aperçu non enregistré : le navigateur demande confirmation
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);
  // Quitter la page sans enregistrer : l'aperçu disparaît
  const latest = useRef({ dirty, saved });
  useEffect(() => { latest.current = { dirty, saved }; });
  useEffect(() => () => { if (latest.current.dirty) applyReading(latest.current.saved); }, []);
  return { prefs, change, dirty, saving, save, revert, reload };
}

export type PrefsState = ReturnType<typeof usePrefs>;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </div>
  );
}

function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (value: T) => void; label: string }) {
  return (
    <ToggleGroup aria-label={label} variant="outline" spacing={0} className="w-full" value={[value]} onValueChange={(values: string[]) => values[0] && onChange(values[0] as T)}>
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} aria-label={o.title} className="min-h-9 flex-1 aria-pressed:bg-brand-tint aria-pressed:text-brand-text aria-pressed:font-semibold coarse:min-h-11">{o.label}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Les réglages eux-mêmes, aussi montés dans Paramètres › Affichage. `course` : seulement ce qui change le texte du cours. */
export function ReadingControls({ initial, preview = true, course = false, state, asking = false, onDone }: {
  initial?: Prefs; preview?: boolean; course?: boolean; state?: PrefsState;
  /** On ferme le panneau avec un aperçu non enregistré : la même barre demande quoi en faire, puis `onDone` referme */
  asking?: boolean; onDone?: () => void;
}) {
  const own = usePrefs(initial);
  const sample = useSample(course);
  const { prefs, change, dirty, saving, save, revert } = state ?? own;
  const font = prefs.readingFont ?? "source";
  // Dans Paramètres : la page a son propre bouton « Enregistrer » (SaveScope), qui enregistre aussi la lecture
  const scope = useSaveScope();
  const inPage = Boolean(scope) && !course;
  useStaged("lecture", inPage && dirty ? { save: async () => (await save() ? { ok: true } : { ok: false, error: "Réglages de lecture : l’enregistrement a échoué" }), revert } : null);
  return (
    <div className="grid gap-5">
      {preview && (
        <p data-reading className="rounded-xl bg-paper p-4 shadow-xs">{sample}</p>
      )}
      <Row label="Police">
        <div role="radiogroup" aria-label="Police de lecture" className="grid grid-cols-2 gap-2">
          {READING_FONTS.map((f) => {
            const active = font === f.id;
            return (
              <button key={f.id} type="button" role="radio" aria-checked={active} onClick={() => change({ readingFont: f.id === "source" ? undefined : f.id })}
                className={cn("grid min-h-14 content-center gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors coarse:min-h-16", active ? "border-brand-text bg-brand-tint text-brand-text" : "border-border hover:bg-muted")}>
                <span aria-hidden className="text-xl leading-none" style={{ fontFamily: f.family }}>Aa</span>
                <span className="text-xs font-semibold">{f.label}</span>
              </button>
            );
          })}
        </div>
        {font === "od" && <p className="text-sm text-muted-foreground">Seulement dans le texte des cours</p>}
      </Row>
      <Row label="Taille">
        <Choice label="Taille du texte" value={prefs.textSize ?? "m"} onChange={(v) => change({ textSize: v === "m" ? undefined : v })}
          options={[{ value: "s", label: <span className="text-xs">A</span>, title: "Petite" }, { value: "m", label: <span className="text-sm">A</span>, title: "Normale" }, { value: "l", label: <span className="text-base">A</span>, title: "Grande" }, { value: "xl", label: <span className="text-lg">A</span>, title: "Très grande" }]} />
      </Row>
      <Row label="Espacement">
        <Choice label="Espacement" value={prefs.spacing ?? "normal"} onChange={(v) => change({ spacing: v === "normal" ? undefined : v })}
          options={[{ value: "normal", label: "Normal" }, { value: "wide", label: "Aéré" }, { value: "wider", label: "Très aéré" }]} />
      </Row>
      <Row label="Largeur de ligne">
        <Choice label="Largeur de ligne" value={prefs.readingWidth ?? "normal"} onChange={(v) => change({ readingWidth: v === "narrow" ? "narrow" : undefined })}
          options={[{ value: "normal", label: "Normale" }, { value: "narrow", label: "Étroite" }]} />
      </Row>
      {!course && <Row label="Thème">
        <Choice label="Thème" value={prefs.theme ?? "system"} onChange={(v) => change({ theme: v === "system" ? undefined : v })}
          options={[{ value: "system", label: <><Icon icon={IconSystem} size={16} />Système</> }, { value: "light", label: <><Icon icon={IconLight} size={16} />Clair</> }, { value: "dark", label: <><Icon icon={IconDark} size={16} />Sombre</> }]} />
      </Row>}
      <div className="grid gap-3">
        {!course && font !== "od" && font !== "source" && <Toggle label="Toute l’interface dans cette police" checked={Boolean(prefs.readingAll)} onChange={(v) => change({ readingAll: v || undefined })} />}
        <Toggle label="Fond crème" checked={Boolean(prefs.paper)} onChange={(v) => change({ paper: v || undefined })} />
        <Toggle label="Pas d’italique" checked={Boolean(prefs.noItalic)} onChange={(v) => change({ noItalic: v || undefined })} />
      </div>
      {/* Un seul « Enregistrer » : quand on ferme avec un aperçu non enregistré, c'est cette barre qui le signale */}
      {!inPage && <div className={cn("flex flex-wrap items-center gap-2 border-t border-border pt-4", asking && dirty && "-mx-2 rounded-lg border-t-0 bg-muted px-2 pb-2")}>
        <Button disabled={!dirty || saving} onClick={async () => { if (await save() && asking) onDone?.(); }}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
        {dirty && <Button variant="ghost" disabled={saving} onClick={() => { revert(); if (asking) onDone?.(); }}>Annuler</Button>}
        {dirty && (asking
          ? <span role="alert" className="text-sm font-semibold">Modifications non enregistrées</span>
          : <span role="status" className="text-sm text-muted-foreground">Non enregistré</span>)}
      </div>}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-8 cursor-pointer items-center justify-between gap-4 text-sm coarse:min-h-11">
      {label}
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

/** Bouton « Aa » : popover à la souris, feuille basse au toucher. Fermer avec un aperçu non enregistré demande quoi faire. */
export function ReadingSettings({ className, initial }: { className?: string; initial?: Prefs }) {
  const coarse = useCoarsePointer();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const state = usePrefs(initial);
  const onOpenChange = (next: boolean) => {
    if (next) { state.reload(); setAsking(false); setOpen(true); return; }
    if (state.dirty) { setAsking(true); return; }
    setOpen(false);
  };
  const body = <ReadingControls course state={state} asking={asking} onDone={() => { setAsking(false); setOpen(false); }} />;
  const trigger = <Button variant="ghost" size="icon" aria-label="Réglages de lecture" className={cn("font-heading text-base font-semibold", className)} />;
  if (coarse) return (
    <>
      <Button variant="ghost" size="icon" aria-label="Réglages de lecture" className={cn("font-heading text-base font-semibold", className)} onClick={() => onOpenChange(true)}>Aa</Button>
      <ResponsiveSheet open={open} onOpenChange={onOpenChange} title="Lecture">{body}</ResponsiveSheet>
    </>
  );
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger}>Aa</PopoverTrigger>
      {/* À droite de la barre d'actions (dans la marge), pour ne pas recouvrir le texte ni la croix du bandeau « Reprendre » */}
      <PopoverContent side="right" align="start" sideOffset={12} className="max-h-[min(40rem,calc(100dvh-6rem))] w-80 overflow-y-auto p-4">{body}</PopoverContent>
    </Popover>
  );
}
