"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EXAM_KINDS, type ExamKind } from "@/lib/exam-kind";

/** Partiel ou contrôle continu, choisi à la création ; « Partiel » d'office. */
export function ExamKindPicker({ onChange }: { onChange?: (kind: ExamKind) => void }) {
  const [kind, setKind] = useState<ExamKind>("partiel");
  return (
    <div className="grid gap-2">
      <input type="hidden" name="kind" value={kind} />
      <Label id="exam-kind">Type</Label>
      <ToggleGroup aria-labelledby="exam-kind" value={[kind]} onValueChange={(v: string[]) => { const next = v[0] as ExamKind | undefined; if (next) { setKind(next); onChange?.(next); } }} className="flex-wrap justify-start">
        {(Object.entries(EXAM_KINDS) as [ExamKind, string][]).map(([value, label]) => <ToggleGroupItem key={value} value={value} variant="outline">{label}</ToggleGroupItem>)}
      </ToggleGroup>
    </div>
  );
}
