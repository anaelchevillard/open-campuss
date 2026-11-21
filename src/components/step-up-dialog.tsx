"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { useActionState, useEffect, useRef, useState } from "react";
import { confirmStepUp } from "@/app/actions/auth";
import { Notice, type FormState } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StepUpMethods } from "@/lib/step-up";
import { Icon } from "@/components/icon";
import { IconPasskey } from "@/lib/icons";

/** Toujours hors du formulaire de l'action : le portail déplace le DOM, pas les événements React. */
export function StepUpDialog({ methods, onProof, onCancel }: { methods: StepUpMethods; onProof: () => void; onCancel: () => void }) {
  const [state, run, pending] = useActionState(async (previous: FormState, data: FormData) => {
    const result = await confirmStepUp(previous, data);
    if (result?.ok) onProof();
    return result;
  }, null);
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state?.error) input.current?.focus();
  }, [state]);

  const withKey = async () => {
    setKeyBusy(true);
    setKeyError("");
    try {
      const start = await fetch("/api/passkey/step-up").then((r) => r.json()) as { options: Parameters<typeof startAuthentication>[0]["optionsJSON"]; challengeId: string; error?: string };
      if (start.error) throw new Error(start.error);
      const response = await startAuthentication({ optionsJSON: start.options });
      const done = await fetch("/api/passkey/step-up", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId: start.challengeId, response }) });
      if (!done.ok) throw new Error(((await done.json().catch(() => ({}))) as { error?: string }).error ?? "Clé non reconnue.");
      onProof();
    } catch (failure) {
      setKeyError((failure as Error).name === "NotAllowedError" ? "Confirmation annulée." : (failure as Error).message);
      setKeyBusy(false);
    }
  };

  const keyButton = (
    <Button type="button" variant={methods.totp ? "outline" : "default"} disabled={keyBusy} onClick={() => void withKey()}>
      <Icon icon={IconPasskey} className="size-4" />Utiliser ma clé d’accès
    </Button>
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirme que c’est bien toi</DialogTitle>
          <DialogDescription>
            {methods.totp ? "Cette action est sensible : saisis le code à 6 chiffres de ton application." : "Cette action est sensible : confirme-la avec ta clé d’accès."} Elle reprendra aussitôt, et rien ne te sera redemandé pendant 10 minutes.
          </DialogDescription>
        </DialogHeader>
        {keyError && <Notice tone="error">{keyError}</Notice>}
        {methods.totp ? (
          <form action={run} className="grid gap-4">
            {state?.error && <Notice tone="error">{state.error}</Notice>}
            <div className="grid gap-1.5">
              <Label htmlFor="step-up-code">Code à 6 chiffres</Label>
              <Input
                ref={input} id="step-up-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required readOnly={pending}
                onChange={(event) => { if (!pending && /^\d{6}$/.test(event.target.value.trim())) event.target.form?.requestSubmit(); }}
              />
            </div>
            {methods.passkey && keyButton}
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
              <Button type="submit" disabled={pending}>Confirmer</Button>
            </DialogFooter>
          </form>
        ) : (
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Annuler</DialogClose>
            {keyButton}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
