import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { keepWeeklyMail } from "@/app/actions/notifications";
import { PublicShell } from "@/components/shell";
import { Submit } from "@/components/submit";
import { db, schema } from "@/lib/db";
import { mailScopeEnabled, setMailScope } from "@/lib/notification-state";
import { parseUnsubscribeToken } from "@/lib/security";

export const metadata: Metadata = { title: "Désinscription", referrer: "no-referrer" };

const TEXTS = {
  weekly: { kept: "Mail hebdomadaire conservé", keptIntro: "Tu continueras à recevoir le résumé de la semaine.", doneIntro: "Tu ne recevras plus le résumé de la semaine. Tes autres notifications ne changent pas." },
  notifications: { kept: "Notifications par mail conservées", keptIntro: "Tu continueras à recevoir les notifications par mail.", doneIntro: "Tu ne recevras plus les notifications par mail (invitations, réponses). Les mails sur ton compte et ta sécurité continuent d’arriver." },
};

export default async function UnsubscribePage({ params, searchParams }: PageProps<"/desabonnement/[token]">) {
  const { token } = await params;
  const parsed = parseUnsubscribeToken(token);
  if (!parsed) notFound();
  const [person] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, parsed.userId));
  if (!person) notFound();
  // Revenir ici après « Le garder » ne doit pas désabonner de nouveau : seul le lien du mail, sans paramètre, coupe l'envoi
  const kept = (await searchParams).garde === "1";
  if (!kept) await setMailScope(parsed.userId, parsed.scope, false);
  const enabled = await mailScopeEnabled(parsed.userId, parsed.scope);
  const text = TEXTS[parsed.scope];
  return (
    <PublicShell title={enabled ? text.kept : "C’est fait"} intro={enabled ? text.keptIntro : text.doneIntro}>
      {!enabled && <form action={keepWeeklyMail}><input type="hidden" name="token" value={token} /><Submit variant="outline">Finalement, les garder</Submit></form>}
    </PublicShell>
  );
}
