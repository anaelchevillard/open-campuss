import type { Metadata } from "next";
import { confirmEmailChange } from "@/app/actions/account";
import { ActionForm } from "@/components/action-form";
import { PublicShell } from "@/components/shell";
import { Submit } from "@/components/submit";

export const metadata: Metadata = { title: "Confirmer ton adresse", referrer: "no-referrer" };

export default async function ConfirmEmailPage({ params }: PageProps<"/email/[token]">) {
  return (
    <PublicShell title="Confirmer la nouvelle adresse">
      <ActionForm action={confirmEmailChange} hideOnOk>
        <input type="hidden" name="token" value={(await params).token} />
        <Submit >Confirmer</Submit>
      </ActionForm>
    </PublicShell>
  );
}
