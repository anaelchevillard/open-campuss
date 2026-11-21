import type { Metadata } from "next";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/admin-header";
import { ago, dateTime, renderedAt } from "@/components/admin/badges";
import { ErrorStatusBadge, sharesText } from "@/components/admin/error-parts";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { Shell } from "@/components/shell";
import { requireAdmin } from "@/lib/auth";
import { errorCounts, errorList, statusFilter } from "@/lib/errors/queries";

export const metadata: Metadata = { title: "Erreurs" };

const TABS = [["open", "Ouvertes"], ["resolved", "Résolues"], ["ignored", "Ignorées"], ["toutes", "Toutes"]] as const;
const fr = (n: number) => n.toLocaleString("fr-FR");

/**
 * Erreurs du site regroupées : serveur et navigateur, nettoyées avant l'écriture, sans identité.
 * Administrateurs seulement (404 sinon, « voir comme » compris) ; liste bornée à 100 groupes.
 */
export default async function ErrorsPage({ searchParams }: PageProps<"/admin/erreurs">) {
  const admin = await requireAdmin();
  const status = statusFilter((await searchParams).statut);
  const [rows, counts] = await Promise.all([errorList(status), errorCounts()]);
  const now = renderedAt();
  const current = status === "all" ? "toutes" : status;
  return (
    <Shell user={admin} width="wide">
      <AdminHeader title="Erreurs" section="suivi" current="/admin/erreurs" program={false} />
      <div className="grid gap-4">
        <SegmentedTabs label="Statut des erreurs" value={current}
          items={TABS.map(([value, label]) => ({ value, label, href: value === "open" ? "/admin/erreurs" : `/admin/erreurs?statut=${value}`, count: value === "toutes" ? undefined : counts[value] }))} />
        <p className="text-sm text-muted-foreground">Erreurs du serveur et des navigateurs, regroupées par empreinte. Personnes touchées : une estimation, sans identité (une même personne compte une fois par jour). Gardées 90 jours.</p>
        {rows.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs" data-testid="error-list">
            {rows.map((row) => (
              <li key={row.id}>
                <Link href={`/admin/erreurs/${row.id}`} className="grid min-w-0 gap-1 px-4 py-3 hover:bg-muted">
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="font-mono text-sm font-semibold">{row.name}</span>
                    <span className="min-w-0 flex-1 truncate">{row.message}</span>
                    <ErrorStatusBadge status={row.status} regressed={Boolean(row.regressedAt && row.status === "open")} />
                  </span>
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground tabular-nums">
                    <span className="font-semibold text-foreground">{fr(row.count)} fois</span>
                    <span>≈ {fr(row.stats.touched)} personne{row.stats.touched > 1 ? "s" : ""}</span>
                    <span>{row.source === "server" ? "Serveur" : "Navigateur"}</span>
                    <span title={dateTime(row.firstSeen)}>depuis {ago(row.firstSeen, now).replace("il y a ", "")}</span>
                    <span title={dateTime(row.lastSeen)}>dernière {ago(row.lastSeen, now)}</span>
                    {row.lastRelease && <span>version <code className="font-mono">{row.lastRelease}</code></span>}
                    {row.route && <span className="max-w-full truncate">{row.route}</span>}
                    {row.stats.browsers.length > 0 && <span>{sharesText(row.stats.browsers)}</span>}
                    {row.stats.systems.length > 0 && <span>{sharesText(row.stats.systems)}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="rounded-xl bg-card px-4 py-6 text-sm text-muted-foreground shadow-xs">Aucune erreur {status === "open" ? "ouverte" : status === "resolved" ? "résolue" : status === "ignored" ? "ignorée" : ""} sur les 90 derniers jours.</p>}
      </div>
    </Shell>
  );
}
