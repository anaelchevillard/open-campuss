import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requestMfaReset, submitTotp } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { Field, TextField } from "@/components/field";
import { PasskeyLogin } from "@/components/security-client";
import { PublicShell } from "@/components/shell";
import { Submit } from "@/components/submit";
import { loadSession, safeNext } from "@/lib/auth";

export const metadata: Metadata = { title: "Double authentification" };

export default async function TotpPage({ searchParams }: PageProps<"/login/2fa">) {
  const row = await loadSession();
  if (!row?.session.mfaPending) redirect("/login");
  return (
    <PublicShell title="Code de vérification">
      <ActionForm action={submitTotp}>
        <input type="hidden" name="next" value={safeNext((await searchParams).next)} />
        <Field label="Code à 6 chiffres, ou code de secours" name="code" autoComplete="one-time-code" maxLength={16} required autoFocus />
        <Submit >Valider</Submit>
      </ActionForm>
      <div className="mt-4"><PasskeyLogin next={safeNext((await searchParams).next)} /></div>
      <details className="mt-6 rounded-xl bg-muted p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Plus d’application ni de code de secours ?</summary>
        <div className="mt-3 grid gap-3">
          <p className="text-muted-foreground">Demande à l’équipe de réinitialiser ton second facteur. L’équipe t’écrit à l’adresse de ton compte : ta réponse prouve que c’est toi. Rien n’est retiré automatiquement.</p>
          <ActionForm action={requestMfaReset}>
            <TextField label="Ce qui s’est passé (facultatif)" name="reason" rows={2} maxLength={500} placeholder="Téléphone perdu, activé par erreur…" />
            <Submit variant="outline">Demander une réinitialisation</Submit>
          </ActionForm>
        </div>
      </details>
    </PublicShell>
  );
}
