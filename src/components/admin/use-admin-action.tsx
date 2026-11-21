"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useStepUp } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NO_REASON } from "@/lib/admin-actions";
import type { AdminResult } from "@/lib/admin-ops";
import { toast, toastError, toastUndo } from "@/lib/toast";

type RunOptions = { success?: string; undo?: () => Promise<unknown>; quiet?: boolean };

type Ask = {
  title: string; description?: ReactNode; confirmLabel: string; level: "sensitive" | "critical";
  /** Critique : le nom ou l'adresse à recopier */
  expected?: string; children?: ReactNode; danger?: boolean;
  /** Propose la case « Prévenir l'utilisateur » (décochée par défaut) */
  notifyOption?: boolean;
};
/** Réponse de la boîte : le motif (« (sans motif) » s'il est laissé vide) et le choix de prévenir la personne. */
export type ReasonAnswer = { reason: string; notify: boolean };

/**
 * Actions d'administration : la preuve manquante ouvre le second facteur et l'action repart seule ; une action sensible
 * ou critique propose d'abord un motif, facultatif (et demande la saisie du nom pour le critique) ; une courante propose « Annuler ».
 */
export function useAdminAction() {
  const router = useRouter();
  const { ask: askStepUp, dialog: stepUp } = useStepUp();
  const [pending, setPending] = useState(false);
  const [asking, setAsking] = useState<(Ask & { resolve: (answer: ReasonAnswer | null) => void }) | null>(null);

  const attempt = useRef<(<T>(call: () => Promise<AdminResult<T>>, opts: RunOptions) => Promise<AdminResult<T> | null>) | null>(null);
  const run = useCallback(async <T,>(call: () => Promise<AdminResult<T>>, opts: RunOptions = {}): Promise<AdminResult<T> | null> => {
    setPending(true);
    try {
      const result = await call();
      if (result?.stepUp) {
        // La preuve redonnée, l'action repart seule
        return await new Promise<AdminResult<T> | null>((resolve) => askStepUp(result.stepUp!, () => { void attempt.current!(call, opts).then(resolve); }));
      }
      if (result?.error) { toastError(result.error); return result; }
      router.refresh();
      const message = result?.ok ?? opts.success;
      if (message && !opts.quiet) {
        if (opts.undo) toastUndo(message, () => { void opts.undo!().then(() => router.refresh()); });
        else toast(message);
      }
      return result;
    } catch {
      toastError("L’action a échoué. Réessaie.");
      return null;
    } finally {
      setPending(false);
    }
  }, [askStepUp, router]);
  useEffect(() => { attempt.current = run; }, [run]);

  /** Propose le motif (et la case « Prévenir l'utilisateur ») : renvoie null si on annule. */
  const askReasonNotify = useCallback((ask: Ask) => new Promise<ReasonAnswer | null>((resolve) => setAsking({ ...ask, resolve })), []);
  /** Propose le motif (et demande le nom) : renvoie null si on annule, « (sans motif) » s'il est laissé vide. */
  const askReason = useCallback(async (ask: Ask) => (await askReasonNotify(ask))?.reason ?? null, [askReasonNotify]);

  const dialog = (
    <>
      {stepUp}
      {asking && <ReasonDialog key={asking.title} {...asking} onDone={(answer) => { asking.resolve(answer); setAsking(null); }} />}
    </>
  );
  return { run, askReason, askReasonNotify, dialog, pending };
}

function ReasonDialog({ title, description, confirmLabel, level, expected, children, danger, notifyOption, onDone }: Ask & { onDone: (answer: ReasonAnswer | null) => void }) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [warn, setWarn] = useState(false);
  const [tried, setTried] = useState(false);
  const nameOk = level !== "critical" || !expected || typed.trim() === expected.trim();
  const submit = () => {
    setTried(true);
    if (nameOk) onDone({ reason: reason.trim() || NO_REASON, notify: warn });
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onDone(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription className="text-base">{description}</DialogDescription>}
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          {children}
          <div className="grid gap-1.5">
            <Label htmlFor="admin-reason">Motif <span className="font-normal text-muted-foreground">(facultatif, gardé dans le journal)</span></Label>
            <Textarea id="admin-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} autoFocus={level !== "critical" || !expected} />
          </div>
          {notifyOption && (
            <Label className="flex items-center gap-2 font-normal"><Checkbox checked={warn} onCheckedChange={(v) => setWarn(v === true)} />Prévenir l’utilisateur</Label>
          )}
          {level === "critical" && expected && (
            <div className="grid gap-1.5">
              <Label htmlFor="admin-expected">Pour confirmer, écris <strong className="font-semibold">{expected}</strong></Label>
              <Input id="admin-expected" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} aria-invalid={tried && !nameOk || undefined} />
            </div>
          )}
          <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0">
            <Button type="button" variant="outline" onClick={() => onDone(null)}>Annuler</Button>
            <Button type="submit" variant={danger || level === "critical" ? "danger" : "default"} className={!nameOk ? "opacity-60" : undefined}>{confirmLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
