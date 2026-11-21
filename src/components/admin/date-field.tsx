"use client";

import { fr } from "date-fns/locale";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { IconCalendar, IconClose } from "@/lib/icons";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const FMT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/** Date en français dans un calendrier (jamais le champ date natif). Valeur AAAA-MM-JJ ou null. */
export function DateSelectorField({ label, value, onChange, clearable = false, id }: { label: string; value: string | null; onChange: (value: string | null) => void; clearable?: boolean; id?: string }) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(`${value}T12:00:00`) : undefined;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger render={<Button id={id} type="button" variant="outline" className="justify-start font-normal" />}>
            <Icon icon={IconCalendar} size={16} className="text-muted-foreground" />{date ? FMT.format(date) : "Choisir une date"}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" locale={fr} selected={date} defaultMonth={date} onSelect={(d) => { onChange(d ? iso(d) : null); setOpen(false); }} />
          </PopoverContent>
        </Popover>
        {clearable && value && <Button type="button" variant="ghost" size="icon-sm" aria-label="Effacer la date" onClick={() => onChange(null)}><Icon icon={IconClose} size={16} /></Button>}
      </div>
    </div>
  );
}
