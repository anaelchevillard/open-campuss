"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createRecoveryCodes } from "@/app/actions/account";
import { Notice, useStepUp } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { isStepUpRequired, type StepUpRequired } from "@/lib/step-up";
import { Icon } from "@/components/icon";
import { IconPasskey } from "@/lib/icons";

export function PasskeyLogin({ next }: { next: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    setError("");
    try {
      const start = await fetch("/api/passkey/login").then((r) => r.json()) as { options: Parameters<typeof startAuthentication>[0]["optionsJSON"]; challengeId: string; error?: string };
      if (start.error) throw new Error(start.error);
      const response = await startAuthentication({ optionsJSON: start.options });
      const done = await fetch("/api/passkey/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId: start.challengeId, response }) });
      if (!done.ok) throw new Error(((await done.json().catch(() => ({}))) as { error?: string }).error ?? "Connexion impossible.");
      window.location.assign(next);
    } catch (failure) {
      setError((failure as Error).name === "NotAllowedError" ? "Connexion annulée." : (failure as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-2">
      <Button type="button" variant="outline"  disabled={busy} onClick={() => void go()}><Icon icon={IconPasskey} className="size-4" />Utiliser une clé d’accès</Button>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

export function AddPasskey() {
  const router = useRouter();
  const [error, setError] = useState("");
  const { ask, dialog } = useStepUp();
  const add = async () => {
    setError("");
    try {
      const start = await fetch("/api/passkey/register").then((r) => r.json()) as StepUpRequired | { options: Parameters<typeof startRegistration>[0]["optionsJSON"]; challengeId: string };
      if (isStepUpRequired(start)) {
        ask(start.stepUp, () => void add());
        return;
      }
      const response = await startRegistration({ optionsJSON: start.options });
      const done = await fetch("/api/passkey/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId: start.challengeId, response, name: navigator.platform || "Clé d’accès" }) });
      if (!done.ok) throw new Error("Cette clé a été refusée.");
      router.refresh();
    } catch (failure) {
      setError((failure as Error).name === "NotAllowedError" ? "Ajout annulé." : (failure as Error).message);
    }
  };
  return (
    <div className="grid gap-2">
      <div><Button type="button" variant="outline"  onClick={() => void add()}><Icon icon={IconPasskey} className="size-4" />Ajouter une clé d’accès</Button></div>
      {error && <Notice tone="error">{error}</Notice>}
      {dialog}
    </div>
  );
}

export function RecoveryCodes({ remaining }: { remaining: number }) {
  const router = useRouter();
  const [codes, setCodes] = useState<string[] | null>(null);
  const { ask, dialog } = useStepUp();
  const create = async () => {
    const result = await createRecoveryCodes();
    // Le second facteur est redemandé s'il n'a pas été donné récemment, puis la génération repart seule
    if (isStepUpRequired(result)) {
      ask(result.stepUp, () => void create());
      return;
    }
    setCodes(result);
    router.refresh();
  };
  return (
    <div className="grid gap-3">
      <p>{remaining ? `${remaining} code${remaining > 1 ? "s" : ""} de secours encore valable${remaining > 1 ? "s" : ""}.` : "Aucun code de secours : si tu perds ton appareil, tu perds l’accès au compte."}</p>
      {codes ? (
        <div className="notice-in rounded-xl bg-card shadow-xs p-3">
          <p className="mb-2 font-semibold">Note-les maintenant, ils ne seront plus affichés.</p>
          <ul data-recovery-codes className="grid grid-cols-2 gap-1 font-mono text-sm">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void navigator.clipboard.writeText(codes.join("\n"))}>Copier</Button>
        </div>
      ) : <div><Button type="button" variant={remaining ? "outline" : "default"}  onClick={() => void create()}>{remaining ? "Générer de nouveaux codes" : "Générer mes codes de secours"}</Button></div>}
      {dialog}
    </div>
  );
}
