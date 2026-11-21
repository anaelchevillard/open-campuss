"use client";

import { useState, type ReactNode } from "react";
import { setGamePref, setReminderHour, setStudyPrivacy, setVacation } from "@/app/actions/habits";
import { useDraft } from "@/components/profile/settings/autosave";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { REMINDER_HOURS } from "@/lib/study-habits";
import { CreditsAndXp, GoalPicker } from "./today-client";

function Row({ title, hint, children }: { title: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 py-3">
      <div className="grid min-w-0 gap-0.5"><span className="flex items-center gap-2 font-semibold">{title}</span>{hint && <span className="text-sm text-muted-foreground">{hint}</span>}</div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Interrupteur en brouillon : part avec « Enregistrer » (SaveScope des paramètres). */
function Toggle({ label, hint, initial, onChange }: { label: string; hint?: string; initial: boolean; onChange: (on: boolean) => Promise<unknown> }) {
  const [on, setOn] = useDraft(`revision:${label}`, initial, async (next) => { await onChange(next); return { ok: true as const }; });
  return (
    <Label className="block cursor-pointer font-normal">
      <Row title={label} hint={hint}>
        <Switch checked={on} onCheckedChange={(next: boolean) => setOn(next)} />
      </Row>
    </Label>
  );
}

const VACATIONS = [{ days: 0, label: "Non" }, { days: 3, label: "3 j" }, { days: 7, label: "7 j" }, { days: 14, label: "14 j" }];
const hourItems = [{ value: "none", label: "Aucun" }, ...REMINDER_HOURS.map((h) => ({ value: String(h), label: `${h} h` }))];

export function RevisionSettings({ goal, reminderHour, vacationUntil, prefs, privacy }: {
  goal: number; reminderHour: number | null; vacationUntil: string | null;
  prefs: { hideGame?: boolean; sounds?: boolean; haptics?: boolean }; privacy: { shareStudy?: boolean; showStudying?: boolean };
}) {
  const [hour, setHour] = useDraft("revision:rappel", reminderHour === null ? "none" : String(reminderHour), async (v) => { await setReminderHour(v === "none" ? null : Number(v)); return { ok: true as const }; });
  const [until, setUntil] = useState(vacationUntil);
  const [vacation, setVacationValue] = useDraft("revision:vacances", "", async (picked) => { if (picked !== "") setUntil(await setVacation(Number(picked))); return { ok: true as const }; });
  const untilLabel = until ? new Date(`${until}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : null;
  return (
    <div className="grid grid-cols-1 gap-10">
      <section aria-label="Rythme" className="grid grid-cols-1 gap-4">
        <h2 className="heading">Rythme</h2>
        <GoalPicker goal={goal} />
        <div className="divide-y divide-border">
          <Row title="Rappel du jour" hint="Un seul par jour, jamais après 22 h">
            <Select items={hourItems} value={hour} onValueChange={(value) => setHour(String(value))}>
              <SelectTrigger aria-label="Heure du rappel" className="min-w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{hourItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
          </Row>
          <div className="grid gap-2 py-3">
            <span id="vacation-label" className="flex items-center gap-2 font-semibold">Vacances</span>
            <span className="text-sm text-muted-foreground">{untilLabel && until! >= new Date().toISOString().slice(0, 10) ? `Ta série est gelée jusqu’au ${untilLabel}` : "La série reste gelée, 14 jours au plus"}</span>
            <ToggleGroup aria-labelledby="vacation-label" value={[vacation]} onValueChange={(v: string[]) => {
              const picked = v[0];
              if (picked === undefined) return;
              setVacationValue(picked);
            }} className="flex-wrap justify-start">
              {VACATIONS.map((v) => <ToggleGroupItem key={v.days} value={String(v.days)} variant="outline" className="min-w-14">{v.label}</ToggleGroupItem>)}
            </ToggleGroup>
          </div>
        </div>
      </section>
      <section aria-label="Jeu" className="grid grid-cols-1 gap-2">
        <h2 className="heading">Jeu</h2>
        <div className="divide-y divide-border">
          <Toggle label="Masquer les éléments de jeu" hint="Flamme, XP, quêtes et ligue disparaissent ; fiches, quiz et partiels restent" initial={Boolean(prefs.hideGame)} onChange={(on) => setGamePref("hideGame", on)} />
          <Toggle label="Sons" hint="Trois sons courts pendant la séance" initial={Boolean(prefs.sounds)} onChange={(on) => setGamePref("sounds", on)} />
          <Toggle label="Vibrations" initial={Boolean(prefs.haptics)} onChange={(on) => setGamePref("haptics", on)} />
        </div>
        <CreditsAndXp />
      </section>
      <section aria-label="Avec mes amis" className="grid grid-cols-1 gap-2">
        <h2 className="heading">Avec tes amis</h2>
        <div className="divide-y divide-border">
          <Toggle label="Partager ma révision" hint="Ligue de la semaine, séries et partiels blancs, visibles de tes amis seulement" initial={Boolean(privacy.shareStudy)} onChange={(on) => setStudyPrivacy("shareStudy", on)} />
          <Toggle label="Montrer quand je révise" hint="« En train de réviser », jamais d’heure précise" initial={Boolean(privacy.showStudying)} onChange={(on) => setStudyPrivacy("showStudying", on)} />
        </div>
      </section>
    </div>
  );
}
