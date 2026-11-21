"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IconDone, IconError } from "@/lib/icons";

/** Coche « Enregistré » 1,2 s à côté du champ, ou l'erreur sous le champ. */
export function SaveState({ state, error }: { state: "idle" | "saving" | "saved" | "error"; error?: string }) {
  if (state === "saved") return <span role="status" className="flex items-center gap-1 text-sm text-success-foreground fade-in"><Icon icon={IconDone} size={16} />Enregistré</span>;
  if (state === "error" && error) return <span role="alert" className="flex items-center gap-1 text-sm text-destructive-foreground"><Icon icon={IconError} size={16} />{error}</span>;
  return null;
}

export function useSaveState() {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const done = (err?: string | null) => {
    clearTimeout(timer.current);
    if (err) { setError(err); setState("error"); return; }
    setState("saved");
    timer.current = setTimeout(() => setState("idle"), 1200);
  };
  return { state, error, start: () => setState("saving"), done };
}

/** Texte enregistré à la perte du focus (600 ms après la dernière frappe si on reste dedans). */
export function SavedText({ id, label, initial, onSave, multiline, maxLength, hint, aside }: {
  id: string; label: string; initial: string; onSave: (value: string) => Promise<string | null | undefined>; multiline?: boolean; maxLength?: number; hint?: ReactNode; aside?: ReactNode;
}) {
  const [value, setValue] = useState(initial);
  const saved = useRef(initial);
  const { state, error, start, done } = useSaveState();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const commit = async () => {
    clearTimeout(timer.current);
    if (value === saved.current) return;
    start();
    const err = await onSave(value);
    if (!err) saved.current = value;
    done(err);
  };
  const onChange = (next: string) => {
    setValue(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void commit(), 600);
  };
  const Field = multiline ? Textarea : Input;
  return (
    <div className="grid gap-1.5">
      <div className="flex min-h-5 items-center justify-between gap-3"><Label htmlFor={id}>{label}</Label><SaveState state={state} error={error} /></div>
      <div className="flex items-start gap-2">
        <Field id={id} value={value} maxLength={maxLength} onChange={(e: { target: { value: string } }) => onChange(e.target.value)} onBlur={() => void commit()} aria-invalid={state === "error" || undefined} rows={multiline ? 3 : undefined} className="min-w-0 flex-1" />
        {aside}
      </div>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}
