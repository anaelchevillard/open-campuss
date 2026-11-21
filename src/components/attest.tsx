"use client";

import Link from "next/link";
import { ATTESTATION_REMINDERS, ATTESTATIONS, type AttestationKind, type RememberedKind } from "@/lib/attestations";

const Allowed = () => <Link className="whitespace-nowrap underline underline-offset-2" href="/cgu#droit-auteur" target="_blank">Ce qui est permis</Link>;

/** À cocher soi-même, et jamais pré-coché. Le lien reste hors de la case : le suivre ne doit pas la cocher. */
export function Attest({ kind, name = "attest", checked, onChange }: { kind: AttestationKind; name?: string; checked?: boolean; onChange?: (value: boolean) => void }) {
  return (
    <div className="grid gap-1.5 rounded-[var(--radius)] border border-input p-3 text-[0.95rem] leading-snug transition-colors duration-150 has-checked:border-[var(--success)]">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" name={name} required className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]" {...(onChange ? { checked: Boolean(checked), onChange: (event) => onChange(event.target.checked) } : {})} />
        <span>{ATTESTATIONS[kind]}</span>
      </label>
      {kind !== "download" && <p className="pl-8 text-sm text-muted-foreground"><Allowed /></p>}
    </div>
  );
}

/** Déjà accepté pour ce type de contenu : une ligne suffit, et chaque envoi garde sa preuve côté serveur. */
export function AttestReminder({ kind }: { kind: RememberedKind }) {
  return <p className="text-sm leading-snug text-muted-foreground">{ATTESTATION_REMINDERS[kind]} <Allowed /></p>;
}
