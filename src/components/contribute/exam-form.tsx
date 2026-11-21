"use client";

import { fr } from "date-fns/locale";
import { useState } from "react";
import { createExam } from "@/app/actions/study";
import { examShort, type ExamKind } from "@/lib/exam-kind";
import { ExamKindPicker } from "@/components/revise/exam-kind-picker";
import { ActionForm } from "@/components/action-form";
import { Icon } from "@/components/icon";
import { Submit } from "@/components/submit";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SubjectPicker, type PickableSubject } from "@/components/subject-picker";
import { IconCalendar } from "@/lib/icons";

const pad = (n: number) => String(n).padStart(2, "0");

/** Ajouter une date de partiel ou de contrôle continu : matière, jour au calendrier, heure. L'heure saisie est une heure de Paris (le serveur la convertit). */
export function ExamForm({ subjects }: { subjects: PickableSubject[] }) {
  const [day, setDay] = useState<Date | undefined>();
  const [time, setTime] = useState("09:00");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ExamKind>("partiel");
  const at = day ? `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}T${time}` : "";
  return (
    <ActionForm action={createExam} className="grid gap-4">
      <SubjectPicker subjects={subjects} id="exam-subject" name="subject" required />
      <ExamKindPicker onChange={setKind} />
      <div className="grid gap-1.5">
        <Label htmlFor="exam-title">Intitulé <span className="font-normal text-muted-foreground">(facultatif)</span></Label>
        <Input id="exam-title" name="title" placeholder={examShort(kind)} maxLength={160} className="text-base" />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
        <div className="grid gap-1.5">
          <Label>Jour</Label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger render={<Button type="button" variant="outline" className="justify-start text-base font-normal" />}>
              <Icon icon={IconCalendar} size={16} className="text-muted-foreground" />
              {day ? day.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : <span className="text-muted-foreground">Choisir un jour</span>}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" locale={fr} selected={day} onSelect={(d) => { setDay(d); setOpen(false); }} disabled={{ before: new Date() }} />
            </PopoverContent>
          </Popover>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="exam-time">Heure</Label>
          <Input id="exam-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required className="text-base" />
        </div>
      </div>
      <input type="hidden" name="at" value={at} />
      <div className="grid gap-1.5">
        <Label htmlFor="exam-place">Lieu <span className="font-normal text-muted-foreground">(facultatif)</span></Label>
        <Input id="exam-place" name="place" maxLength={120} className="text-base" />
      </div>
      <div><Submit>Ajouter au calendrier</Submit></div>
    </ActionForm>
  );
}
