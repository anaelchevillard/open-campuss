import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { acceptInvitation } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { Field, selectClass } from "@/components/field";
import { PublicShell } from "@/components/shell";
import { Submit } from "@/components/submit";
import { Label } from "@/components/ui/label";
import { listPrograms } from "@/lib/catalog";
import { MIN_PASSWORD } from "@/lib/constants";
import { db, schema } from "@/lib/db";
import { usableInvitation } from "@/lib/invitations";

export const metadata: Metadata = { title: "Ton invitation", referrer: "no-referrer" };

export default async function InvitationPage({ params }: PageProps<"/invitation/[token]">) {
  const { token } = await params;
  const inv = await usableInvitation(token);
  if (!inv) return <PublicShell title="Invitation expirée" intro="Ce lien n’est plus valable. Demande-en un nouveau à la personne qui t’a invité·e."><Link className="text-link underline" href="/login">Se connecter</Link></PublicShell>;
  if (inv.email && !inv.openedAt) await db.update(schema.invitations).set({ openedAt: new Date() }).where(eq(schema.invitations.id, inv.id));
  const programs = (await listPrograms()).filter((p) => p.active || p.id === inv.programId);
  const program = programs.find((p) => p.id === inv.programId);
  return (
    <PublicShell title="Créer mon compte" intro={[program?.name, inv.level ? `L${inv.level}` : null].filter(Boolean).join(" · ") || undefined}>
      <ActionForm action={acceptInvitation} hideOnOk>
        <input type="hidden" name="token" value={token} />
        <Field label="Prénom et nom" name="name" autoComplete="name" defaultValue={inv.name} maxLength={80} />
        {inv.email
          ? <><input type="hidden" name="email" value={inv.email} autoComplete="username" /><p className="-mt-1 text-sm text-muted-foreground">{inv.email}</p></>
          : <Field label="Adresse mail" hint={inv.allowedDomain ? ` (@${inv.allowedDomain})` : undefined} name="email" type="email" autoComplete="email" required />}
        {(!program || !inv.level) && (
          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
            {!program ? (
              <div className="grid gap-1.5">
                <Label htmlFor="program" className="text-[0.95rem]">Licence</Label>
                <select id="program" name="program" required defaultValue="" className={selectClass}>
                  <option value="" disabled>Choisir…</option>
                  {programs.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
                </select>
              </div>
            ) : <div />}
            {!inv.level && (
              <div className="grid gap-1.5">
                <Label htmlFor="level" className="text-[0.95rem]">Année</Label>
                <select id="level" name="level" defaultValue="1" className={selectClass}><option value="1">L1</option><option value="2">L2</option><option value="3">L3</option></select>
              </div>
            )}
          </div>
        )}
        {inv.email && <Field label="Mot de passe" hint={` (${MIN_PASSWORD} caractères minimum)`} name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required />}
        <label className="flex items-start gap-2.5 text-[0.95rem] leading-snug">
          <input type="checkbox" name="terms" required className="mt-0.5 size-4 accent-[var(--primary)]" />
          <span>J’accepte les <Link className="text-link underline underline-offset-2" href="/cgu" target="_blank">conditions d’utilisation</Link> et j’ai lu la <Link className="text-link underline underline-offset-2" href="/confidentialite" target="_blank">politique de confidentialité</Link>.</span>
        </label>
        <Submit>Créer mon compte</Submit>
      </ActionForm>
    </PublicShell>
  );
}
