import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { enterDemo, login } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { PasskeyLogin } from "@/components/security-client";
import { PublicShell } from "@/components/shell";
import { Submit } from "@/components/submit";
import { currentUser, safeNext } from "@/lib/auth";
import { DEMO_EMAIL, DEMO_PASSWORD, isDemo } from "@/lib/demo";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeNext((await searchParams).next);
  if (await currentUser()) redirect(next);
  const demo = isDemo();
  return (
    <PublicShell title="Connexion">
      {demo && (
        <section aria-labelledby="demo-title" className="mb-6 grid gap-3 rounded-[var(--radius)] border border-border bg-muted p-4">
          <h2 id="demo-title" className="text-[0.95rem] font-semibold">Compte de démonstration</h2>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Adresse</dt><dd className="break-all font-mono">{DEMO_EMAIL}</dd>
            <dt className="text-muted-foreground">Mot de passe</dt><dd className="break-all font-mono">{DEMO_PASSWORD}</dd>
          </dl>
          <ActionForm action={enterDemo}>
            <Submit>Entrer dans la démo</Submit>
          </ActionForm>
          <p className="text-sm text-muted-foreground">Étudiant fictif d’une licence fictive. Le compte est partagé : ce que tu y fais disparaît à la remise à zéro de la nuit.</p>
        </section>
      )}
      <ActionForm action={login}>
        <input type="hidden" name="next" value={next} />
        <Field label="Adresse mail" name="email" type="email" autoComplete="username" required autoFocus={!demo} />
        <Field label="Mot de passe" name="password" type="password" autoComplete="current-password" required />
        <Submit >Se connecter</Submit>
      </ActionForm>
      <div className="mt-3"><PasskeyLogin next={next} /></div>
      {!demo && <p className="mt-6 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[0.95rem]"><Link className="text-[var(--link)] underline-offset-2 hover:underline" href="/register">Créer mon compte</Link><Link className="text-muted-foreground underline-offset-2 hover:underline" href="/forgot">Mot de passe oublié</Link></p>}
    </PublicShell>
  );
}
