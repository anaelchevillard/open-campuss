"use client";

import { useActionState, useState } from "react";
import { createExam } from "@/app/actions/study";
import { examShort, type ExamKind } from "@/lib/exam-kind";
import { ExamKindPicker } from "@/components/revise/exam-kind-picker";
import type { FormState } from "@/components/action-form";
import { Icon } from "@/components/icon";
import { DateSelector, type DateSelectorValue } from "@/components/reui/date-selector";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { IconAdd, IconError } from "@/lib/icons";
import { toast } from "@/lib/toast";

const FR = {
  selectDate: "Choisir une date", apply: "Choisir", cancel: "Annuler", clear: "Effacer", today: "Aujourd’hui",
  filterTypes: { is: "le", before: "avant", after: "après", between: "entre" },
  periodTypes: { day: "Jour", month: "Mois", quarter: "Trimestre", halfYear: "Semestre", year: "Année" },
  months: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  monthsShort: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
  quarters: ["T1", "T2", "T3", "T4"], halfYears: ["S1", "S2"],
  weekdays: ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
  weekdaysShort: ["di", "lu", "ma", "me", "je", "ve", "sa"],
  placeholder: "jj/mm/aaaa", rangePlaceholder: "jj/mm/aaaa",
};

const HOURS = ["08:00", "09:00", "10:00", "13:00", "14:00", "16:00"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Ajouter une date de partiel ou de contrôle continu (délégués) : matière, jour, heure ; pas de champ date natif. */
export function ExamDateForm({ subjects }: { subjects: { id: number; name: string }[] }) {
  const [open, setOpen] = useState(false);
  // Date ajoutée : la feuille se ferme d'elle-même, un toast confirme
  const [state, action, pending] = useActionState<FormState, FormData>(async (previous, form) => {
    const result = await createExam(previous, form);
    if (result?.ok) { setOpen(false); toast(result.ok.replace(/\.$/, "")); }
    return result;
  }, null);
  const [subject, setSubject] = useState(subjects[0] ? String(subjects[0].id) : "");
  const [date, setDate] = useState<DateSelectorValue>({ period: "day", operator: "is" });
  const [hour, setHour] = useState("09:00");
  const [kind, setKind] = useState<ExamKind>("partiel");
  const day = date.startDate ? `${date.startDate.getFullYear()}-${pad(date.startDate.getMonth() + 1)}-${pad(date.startDate.getDate())}` : "";
  const year = new Date().getFullYear();
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Icon icon={IconAdd} size={16} />Ajouter une date</Button>
      <ResponsiveSheet open={open} onOpenChange={setOpen} title="Nouvelle date de partiel ou de CC" size="lg">
        <form action={action} className="grid gap-5 pb-4">
          <input type="hidden" name="subject" value={subject} />
          <input type="hidden" name="at" value={day ? `${day}T${hour}` : ""} />
          <div className="grid gap-2">
            <Label id="exam-subject">Matière</Label>
            <ToggleGroup aria-labelledby="exam-subject" value={[subject]} onValueChange={(v: string[]) => v[0] && setSubject(v[0])} className="flex-wrap justify-start">
              {subjects.map((s) => <ToggleGroupItem key={s.id} value={String(s.id)} variant="outline">{s.name}</ToggleGroupItem>)}
            </ToggleGroup>
          </div>
          <ExamKindPicker onChange={setKind} />
          <div className="grid gap-2">
            <Label>Jour</Label>
            <DateSelector value={date} onChange={setDate} allowRange={false} periodTypes={["day"]} presetMode="is" showTwoMonths={false} i18n={FR} dayDateFormat="dd/MM/yyyy" weekStartsOn={1} minYear={year} maxYear={year + 2} baseYear={year} />
          </div>
          <div className="grid gap-2">
            <Label id="exam-hour">Heure</Label>
            <ToggleGroup aria-labelledby="exam-hour" value={[hour]} onValueChange={(v: string[]) => v[0] && setHour(v[0])} className="flex-wrap justify-start">
              {HOURS.map((h) => <ToggleGroupItem key={h} value={h} variant="outline" className="tabular-nums">{h.replace(":00", " h")}</ToggleGroupItem>)}
            </ToggleGroup>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="exam-title">Intitulé</Label><Input id="exam-title" name="title" placeholder={examShort(kind)} maxLength={160} /></div>
          <div className="grid gap-1.5"><Label htmlFor="exam-place">Lieu</Label><Input id="exam-place" name="place" maxLength={120} /></div>
          {state?.error && <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive-foreground"><Icon icon={IconError} size={16} />{state.error}</p>}
          <Button type="submit" pending={pending}>Ajouter au calendrier</Button>
        </form>
      </ResponsiveSheet>
    </>
  );
}
