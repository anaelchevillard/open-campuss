import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/admin-header";
import { SettingsForm } from "@/components/admin/settings-form";
import { Shell } from "@/components/shell";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { getSetting, SETTING_KEYS } from "@/lib/site-settings";

export const metadata: Metadata = { title: "Réglages" };

/** Réglages du site en base. Les secrets restent dans app.env : seul leur état apparaît ici. */
export default async function SettingsPage() {
  const admin = await requireAdmin();
  const values = Object.fromEntries(await Promise.all(SETTING_KEYS.map(async (k) => [k, await getSetting(k)] as const)));
  const secrets: [string, boolean][] = [
    ["Envoi de mails (SMTP)", env.smtpEnabled], ["Campuss IA", Boolean(env.aiApiKey)], ["Notion (import direct)", Boolean(env.notionToken)],
    ["Connexion Notion", Boolean(env.notionOauthClientId)], ["Connexion Google", Boolean(env.googleOauthClientId)], ["Notifications push", env.pushEnabled], ["Antivirus", Boolean(env.clamavHost)],
  ];
  return (
    <Shell user={admin} width="wide">
      <AdminHeader title="Réglages" section="suivi" current="/admin/reglages" program={false} />
      <SettingsForm values={values as never} secrets={secrets} aiKey={Boolean(env.aiApiKey)} />
    </Shell>
  );
}
