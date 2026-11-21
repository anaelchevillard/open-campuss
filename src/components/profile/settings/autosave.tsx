"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "cn";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useStaged, type SaveOutcome } from "@/components/save-guard";
import { IconDone, IconError } from "@/lib/icons";

export type { SaveOutcome };
export type SaveState = "idle" | "saving" | "saved" | "error";

/** Enregistre, puis montre la coche « Enregistré » 1,2 s ; une erreur reste sous le champ. */
export function useAutosave() {
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const run = useCallback(async (save: () => Promise<SaveOutcome>) => {
    clearTimeout(timer.current);
    setState("saving");
    try {
      const result = await save();
      if (result && !result.ok) { setError(result.error); setState("error"); return false; }
      setError("");
      setState("saved");
      timer.current = setTimeout(() => setState("idle"), 1200);
      return true;
    } catch {
      setError("Pas enregistré : vérifie ta connexion");
      setState("error");
      return false;
    }
  }, []);
  return { state, error, run };
}

/** Point qui pulse pendant l'envoi, puis coche « Enregistré ». */
export function SavedTick({ state, className }: { state: SaveState; className?: string }) {
  return (
    <span aria-live="polite" className={cn("inline-flex min-w-24 items-center justify-end gap-1 text-sm text-muted-foreground", className)}>
      {state === "saving" && <span className="size-1.5 animate-[saving_1s_ease-in-out_infinite] rounded-full bg-muted-foreground" aria-label="Enregistrement" />}
      {state === "saved" && <span className="inline-flex items-center gap-1 text-success-foreground animate-[fade_150ms_ease-out]"><Icon icon={IconDone} size={16} />Enregistré</span>}
    </span>
  );
}

export function FieldError({ error }: { error: string }) {
  if (!error) return null;
  return <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive-foreground animate-[notice-in_200ms_ease-out]"><Icon icon={IconError} size={16} className="mt-0.5" />{error}</p>;
}

/**
 * Valeur d'un réglage en brouillon : la page la montre tout de suite, elle part au clic sur « Enregistrer »
 * (SaveScope). `onApply` est rappelé à chaque changement et à l'annulation (aperçu en direct).
 */
export function useDraft<T>(key: string, initial: T, save: (value: T) => Promise<SaveOutcome>, options: { same?: (a: T, b: T) => boolean; onApply?: (value: T) => void } = {}) {
  const [value, setValue] = useState(initial);
  const [base, setBase] = useState(initial);
  const same = options.same ?? Object.is;
  const apply = options.onApply;
  useStaged(key, same(value, base) ? null : {
    save: async () => { const result = await save(value); if (!result || result.ok) setBase(value); return result; },
    revert: () => { setValue(base); apply?.(base); },
  });
  const change = (next: T) => { setValue(next); apply?.(next); };
  return [value, change] as const;
}

/** Texte en brouillon, enregistré avec le reste de la page. */
export function DraftText({ id, label, value, onChange, multiline, maxLength, hint, placeholder, autoComplete }: {
  id: string; label: string; value: string; onChange: (value: string) => void; multiline?: boolean; maxLength?: number; hint?: ReactNode; placeholder?: string; autoComplete?: string;
}) {
  const common = { id, value, maxLength, placeholder, autoComplete };
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {multiline
        ? <Textarea {...common} rows={3} className="text-base" onChange={(e) => onChange(e.target.value)} />
        : <Input {...common} className="text-base" onChange={(e) => onChange(e.target.value)} />}
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Interrupteur en brouillon : enregistré avec le reste de la page. */
export function AutoSwitch({ label, description, checked, onSave }: { label: string; description?: ReactNode; checked: boolean; onSave: (value: boolean) => Promise<SaveOutcome> }) {
  const id = useId();
  const [on, setOn] = useDraft(`switch:${label}`, checked, onSave);
  return <SwitchRow id={id} label={label} description={description} checked={on} onChange={setOn} />;
}

export function SwitchRow({ id, label, description, checked, onChange }: { id: string; label: string; description?: ReactNode; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 fine:min-h-9">
      <div className="min-w-0">
        <Label htmlFor={id} className="cursor-pointer">{label}</Label>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** Un groupe de réglages : titre de section, puis une carte. */
export function SettingsGroup({ id, title, description, action, children, className }: { id?: string; title?: string; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("grid scroll-mt-24 grid-cols-1 gap-3", className)}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-3">
          <div>
            {title && <h2 className="heading">{title}</h2>}
            {description && <p className="mt-1 text-sm text-muted-foreground text-pretty">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {/* grid-cols-1 : une seule colonne minmax(0, 1fr) ; un titre long tronqué ne peut plus élargir la page */}
      <div className="grid grid-cols-1 gap-4 rounded-xl bg-card p-4 shadow-xs md:p-6">{children}</div>
    </section>
  );
}
