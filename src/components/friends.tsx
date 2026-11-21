"use client";

import { useState } from "react";
import { requestFriend } from "@/app/actions/friends";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Submit } from "@/components/submit";
import { Button } from "@/components/ui/button";

export function AddFriend({ initial }: { initial: string }) {
  return (
    <ActionForm action={requestFriend} className="grid gap-2">
      <Field label="Son code ou son adresse" name="who" defaultValue={initial} required maxLength={254} autoComplete="off" />
      <div><Submit>Envoyer la demande</Submit></div>
    </ActionForm>
  );
}

export function CopyCode({ code, link }: { code: string; link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-2">
      <p data-testid="friend-code" className="font-mono text-2xl font-semibold tracking-widest">{code}</p>
      <div><Button variant="outline" size="sm" onClick={async () => { await navigator.clipboard?.writeText(link).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>{copied ? "Lien copié" : "Copier mon lien"}</Button></div>
    </div>
  );
}
