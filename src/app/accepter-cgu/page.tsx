import type { Metadata } from "next";
import Link from "next/link";
import { acceptTerms } from "@/app/actions/auth";
import { PublicShell } from "@/components/shell";
import { Submit } from "@/components/submit";
import { requireUserAny } from "@/lib/auth";

export const metadata: Metadata = { title: "Conditions d’utilisation" };

export default async function AcceptTermsPage() {
  await requireUserAny();
  return (
    <PublicShell title="Conditions d’utilisation" intro="Lis-les et accepte-les pour accéder à Campuss, notamment ce qui concerne le droit d’auteur.">
      <form action={acceptTerms} className="grid gap-4">
        <label className="flex items-start gap-2.5 leading-snug">
          <input type="checkbox" name="terms" required className="mt-0.5 size-4 accent-[var(--primary)]" />
          <span>J’accepte les <Link className="text-[var(--link)] underline underline-offset-2" href="/cgu" target="_blank">conditions d’utilisation</Link> et j’ai lu la <Link className="text-[var(--link)] underline underline-offset-2" href="/confidentialite" target="_blank">politique de confidentialité</Link>.</span>
        </label>
        <Submit >Accepter et continuer</Submit>
      </form>
    </PublicShell>
  );
}
