import type { Metadata } from "next";
import Link from "next/link";
import { register } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { IndependenceNotice } from "@/components/independence";
import { Field, selectClass, TextField } from "@/components/field";
import { PublicShell } from "@/components/shell";
import { Label } from "@/components/ui/label";
import { listPrograms } from "@/lib/catalog";
import { isInviteCode } from "@/lib/invite-code";
import { Submit } from "@/components/submit";
import { Turnstile } from "@/components/turnstile";
import { isDemo } from "@/lib/demo";
import { env } from "@/lib/env";
import { getSetting } from "@/lib/site-settings";

export const metadata: Metadata = { title: "Créer mon compte" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const invite = (await searchParams).ref;
  // Démonstration : un seul compte partagé, l’inscription est refusée aussi côté serveur (register)
  if (isDemo()) return <PublicShell title="Créer mon compte" intro="Pas d’inscription sur la démo : entre avec le compte de démonstration."><Link className="text-link underline-offset-2 hover:underline" href="/login">Entrer dans la démo</Link></PublicShell>;
  const mode = await getSetting("registration.mode");
  if (mode !== "open") {
    const closed = mode === "closed" ? (await getSetting("registration.closedMessage")) || "Les inscriptions sont fermées pour le moment." : "Les inscriptions se font sur invitation : ouvre le lien que tu as reçu.";
    return <PublicShell title="Créer mon compte" intro={closed}><Link className="text-link underline-offset-2 hover:underline" href="/login">J’ai déjà un compte</Link></PublicShell>;
  }
  const [programs, students] = await Promise.all([listPrograms().then((all) => all.filter((p) => p.active)), getSetting("registration.autoApproveDomains")]);
  // L'inscription publique est réservée aux adresses étudiantes (vérifié par register)
  const domain = students[0];
  return (
    <PublicShell title="Créer mon compte" intro={`Réservé aux étudiants : utilise ton adresse ${domain ? `@${domain}` : "étudiante"}. Ton compte est actif dès la confirmation du mail.`}>
      <ActionForm action={register} hideOnOk>
        {isInviteCode(invite) && <input type="hidden" name="ref" value={invite} />}
        <Field label="Prénom et nom" name="name" autoComplete="name" maxLength={80} />
        <Field label="Adresse mail" name="email" type="email" autoComplete="email" required />
        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="program" className="text-[0.95rem]">Licence</Label>
            <select id="program" name="program" required defaultValue={programs.length === 1 ? programs[0].slug : ""} className={selectClass}>
              {programs.length !== 1 && <option value="" disabled>Choisir…</option>}
              {programs.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="level" className="text-[0.95rem]">Année</Label>
            <select id="level" name="level" defaultValue="1" className={selectClass}><option value="1">L1</option><option value="2">L2</option><option value="3">L3</option></select>
          </div>
        </div>
        <p className="-mt-2 text-sm text-muted-foreground">Tu n’auras accès qu’aux cours de cette licence.</p>
        <TextField label="Qui es-tu ?" hint=" (facultatif)" placeholder="Groupe, promo…" name="message" rows={2} maxLength={500} />
        <div className="absolute -left-[9999px]" aria-hidden="true"><label>Site web<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <label className="flex items-start gap-2.5 text-[0.95rem] leading-snug">
          <input type="checkbox" name="terms" required className="mt-0.5 size-4 accent-[var(--primary)]" />
          <span>J’accepte les <Link className="text-[var(--link)] underline underline-offset-2" href="/cgu" target="_blank">conditions d’utilisation</Link> et j’ai lu la <Link className="text-[var(--link)] underline underline-offset-2" href="/confidentialite" target="_blank">politique de confidentialité</Link>.</span>
        </label>
        {env.turnstileEnabled && <Turnstile siteKey={env.turnstileSiteKey} />}
        <Submit >Créer mon compte</Submit>
      </ActionForm>
      <IndependenceNotice className="mt-5 text-sm text-muted-foreground" />
      <p className="mt-5 text-sm"><Link className="text-[var(--link)] underline-offset-2 hover:underline" href="/login">J’ai déjà un compte</Link></p>
    </PublicShell>
  );
}
