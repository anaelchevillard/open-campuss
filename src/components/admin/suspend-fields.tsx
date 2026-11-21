"use client";

import { DateSelectorField } from "@/components/admin/date-field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type SuspendValue = { preset: "24h" | "7j" | "30j" | "date"; date: string | null; reason: string; message: string };

/** Suspension datée : 24 h, 7 j, 30 j ou une date ; motif interne et message montré à la personne. */
export function SuspendFields({ value, onChange }: { value: SuspendValue; onChange: (value: SuspendValue) => void }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label>Durée</Label>
        <ToggleGroup variant="outline" value={[value.preset]} onValueChange={(v) => v[0] && onChange({ ...value, preset: v[0] as SuspendValue["preset"] })}>
          <ToggleGroupItem value="24h">24 h</ToggleGroupItem>
          <ToggleGroupItem value="7j">7 j</ToggleGroupItem>
          <ToggleGroupItem value="30j">30 j</ToggleGroupItem>
          <ToggleGroupItem value="date">Date</ToggleGroupItem>
        </ToggleGroup>
        {value.preset === "date" && <DateSelectorField label="Jusqu’au" value={value.date} onChange={(date) => onChange({ ...value, date })} />}
      </div>
      <div className="grid gap-1.5"><Label htmlFor="suspend-reason">Motif interne <span className="font-normal text-muted-foreground">(facultatif)</span></Label><Textarea id="suspend-reason" rows={2} value={value.reason} onChange={(e) => onChange({ ...value, reason: e.target.value })} maxLength={500} /></div>
      <div className="grid gap-1.5"><Label htmlFor="suspend-message">Message montré à la personne</Label><Textarea id="suspend-message" rows={2} value={value.message} onChange={(e) => onChange({ ...value, message: e.target.value })} maxLength={500} /></div>
    </div>
  );
}
