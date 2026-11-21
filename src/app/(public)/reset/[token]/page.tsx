import type { Metadata } from "next";
import Link from "next/link";
import { resetPassword, tokenIsValid } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { PublicShell } from "@/components/shell";
import { Submit } from "@/components/submit";
import { MIN_PASSWORD } from "@/lib/constants";

export const metadata: Metadata = { title: "Nouveau mot de passe", referrer: "no-referrer" };

export default async function ResetPage({ params }: PageProps<"/reset/[token]">) {
  const { token } = await params;
  if (!await tokenIsValid(token, "reset")) {
    return <PublicShell title="Lien expiré" intro="Ce lien n'est plus valide."><Link className="text-[var(--link)] underline" href="/forgot">Demander un nouveau lien</Link></PublicShell>;
  }
  return (
    <PublicShell title="Nouveau mot de passe">
      <ActionForm action={resetPassword}>
        <input type="hidden" name="token" value={token} />
        <Field label="Mot de passe" hint={` (${MIN_PASSWORD} caractères minimum)`} name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required autoFocus />
        <Submit >Enregistrer</Submit>
      </ActionForm>
    </PublicShell>
  );
}
