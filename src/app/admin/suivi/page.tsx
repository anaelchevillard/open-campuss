import type { Metadata } from "next";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/admin-header";
import { Icon } from "@/components/icon";
import { Shell } from "@/components/shell";
import { requireAdmin } from "@/lib/auth";
import { systemChecks } from "@/lib/system-health";
import { IconChevronRight, IconError, IconErrors, IconJournal, IconPalette, IconSiteSettings, IconStats, IconSystemHealth, type IconData } from "@/lib/icons";

export const metadata: Metadata = { title: "Suivi" };

/** Onglet Suivi du téléphone : statistiques, journal, système, réglages. */
export default async function FollowUpPage() {
  const user = await requireAdmin();
  const problems = (await systemChecks()).filter((c) => c.state === "error").length;
  const links: [string, string, IconData, string?][] = [
    ["/admin/statistiques", "Statistiques", IconStats], ["/admin/journal", "Journal", IconJournal], ["/admin/erreurs", "Erreurs", IconErrors],
    ["/admin/systeme", "Système", IconSystemHealth, problems ? `${problems} problème${problems > 1 ? "s" : ""}` : undefined], ["/admin/reglages", "Réglages", IconSiteSettings], ["/admin/charte", "Charte", IconPalette],
  ];
  return (
    <Shell user={user} width="wide">
      <AdminHeader title="Suivi" section="suivi" current="/admin/suivi" program={false} />
      <ul className="max-w-xl divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs">
        {links.map(([href, label, icon, alert]) => (
          <li key={href}><Link href={href} className="flex min-h-14 items-center gap-3 px-4 hover:bg-muted"><Icon icon={icon} className="text-muted-foreground" /><span className="flex-1 font-semibold">{label}</span>
            {alert && <span className="flex items-center gap-1 text-sm font-semibold text-destructive-foreground"><Icon icon={IconError} size={16} />{alert}</span>}
            <Icon icon={IconChevronRight} size={16} className="text-muted-foreground" /></Link></li>
        ))}
      </ul>
    </Shell>
  );
}
