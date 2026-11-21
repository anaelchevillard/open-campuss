import type { Metadata } from "next";
import Link from "next/link";
import { forgotPassword } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { PublicShell } from "@/components/shell";
import { Submit } from "@/components/submit";
import { isDemo } from "@/lib/demo";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPage() {
  if (isDemo()) return <PublicShell title="Mot de passe oublié" intro="Le mot de passe de la démo est affiché sur la page de connexion."><Link className="text-[var(--link)] underline-offset-2 hover:underline" href="/login">Retour à la connexion</Link></PublicShell>;
  return (
    <PublicShell title="Mot de passe oublié">
      <ActionForm action={forgotPassword} hideOnOk>
        <Field label="Adresse mail" name="email" type="email" autoComplete="email" required autoFocus />
        <Submit >Recevoir un lien</Submit>
      </ActionForm>
      <p className="mt-5 text-sm"><Link className="text-[var(--link)] underline-offset-2 hover:underline" href="/login">Retour à la connexion</Link></p>
    </PublicShell>
  );
}
