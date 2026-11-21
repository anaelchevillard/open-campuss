import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { verifyEmail } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { PublicShell } from "@/components/shell";
import { Submit } from "@/components/submit";
import { MIN_PASSWORD } from "@/lib/constants";
import { db, schema } from "@/lib/db";
import { tokenHash } from "@/lib/security";

export const metadata: Metadata = { title: "Confirmer ton adresse", referrer: "no-referrer" };

// Page intermédiaire : les antivirus de messagerie ouvrent les liens et ne doivent rien valider
export default async function VerifyPage({ params }: PageProps<"/verify/[token]">) {
  const { token } = await params;
  const [row] = await db.select({ expiresAt: schema.oneTimeTokens.expiresAt, purpose: schema.oneTimeTokens.purpose, name: schema.users.name, email: schema.users.email })
    .from(schema.oneTimeTokens).innerJoin(schema.users, eq(schema.oneTimeTokens.userId, schema.users.id))
    .where(eq(schema.oneTimeTokens.tokenHash, tokenHash(token)));
  if (!row || row.purpose !== "verify" || row.expiresAt < new Date()) {
    return <PublicShell title="Lien expiré" intro="Ce lien n'est plus valide."><Link className="text-[var(--link)] underline" href="/register">Refaire une demande</Link></PublicShell>;
  }
  return (
    <PublicShell title="Confirmer ton adresse" intro={row.email}>
      <ActionForm action={verifyEmail} hideOnOk>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="email" value={row.email} autoComplete="username" />
        <Field label="Prénom et nom" name="name" defaultValue={row.name} autoComplete="name" maxLength={80} />
        <Field label="Mot de passe" hint={` (${MIN_PASSWORD} caractères minimum)`} name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required autoFocus />
        <Submit >Confirmer et envoyer ma demande</Submit>
      </ActionForm>
    </PublicShell>
  );
}
