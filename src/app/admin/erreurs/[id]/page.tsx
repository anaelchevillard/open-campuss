import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { dateTime } from "@/components/admin/badges";
import { ErrorStatusActions, ErrorStatusBadge, sharesText } from "@/components/admin/error-parts";
import { Shell } from "@/components/shell";
import { requireAdmin } from "@/lib/auth";
import { errorDetail } from "@/lib/errors/queries";

export const metadata: Metadata = { title: "Erreur" };

const fr = (n: number) => n.toLocaleString("fr-FR");

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <li className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
      <span className="font-semibold">{label}</span>
      <span className="ml-auto min-w-0 text-right wrap-break-word text-muted-foreground">{value}</span>
    </li>
  );
}

/** Une erreur : pile nettoyée, répartitions, derniers exemples (20) et statut. Administrateurs seulement. */
export default async function ErrorPage({ params }: PageProps<"/admin/erreurs/[id]">) {
  const admin = await requireAdmin();
  const raw = (await params).id;
  const id = /^\d{1,15}$/.test(raw) ? Number(raw) : null;
  const detail = id ? await errorDetail(id) : null;
  if (!detail) notFound();
  const { group, samples, stats } = detail;
  return (
    <Shell user={admin} width="wide">
      <AdminHeader title={group.name} section="suivi" current="/admin/erreurs" program={false} action={<ErrorStatusActions id={group.id} status={group.status} />} />
      <p className="mb-4 text-sm"><Link href="/admin/erreurs" className="underline-offset-2 hover:underline">← Toutes les erreurs</Link></p>
      <div className="grid gap-8 lg:grid-cols-2">
        <section className="grid content-start gap-3">
          <h2 className="heading">Résumé</h2>
          <p className="wrap-break-word" data-testid="error-message">{group.message}</p>
          <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs">
            <Row label="Statut" value={<><ErrorStatusBadge status={group.status} regressed={Boolean(group.regressedAt && group.status === "open")} />{group.statusAt && <span className="ml-2">le {dateTime(group.statusAt)}{group.statusRelease ? ` (version ${group.statusRelease})` : ""}</span>}</>} />
            <Row label="Origine" value={group.source === "server" ? "Serveur" : "Navigateur"} />
            <Row label="Occurrences" value={fr(group.count)} />
            <Row label="Personnes touchées (estimation)" value={`≈ ${fr(stats.touched)}`} />
            <Row label="Première" value={`${dateTime(group.firstSeen)} · version ${group.firstRelease || "?"}`} />
            <Row label="Dernière" value={`${dateTime(group.lastSeen)} · version ${group.lastRelease || "?"}`} />
            {group.regressedAt && <Row label="Revenue" value={dateTime(group.regressedAt)} />}
            <Row label="Routes" value={sharesText(stats.routes) || group.route || "—"} />
            <Row label="Navigateurs" value={sharesText(stats.browsers) || "—"} />
            <Row label="Systèmes" value={sharesText(stats.systems) || "—"} />
            <Row label="Versions" value={sharesText(stats.releases) || "—"} />
          </ul>
        </section>
        <section className="grid min-w-0 content-start gap-3">
          <h2 className="heading">Pile</h2>
          {group.stack
            ? <pre className="max-h-96 overflow-auto rounded-xl bg-muted p-4 font-mono text-xs leading-relaxed whitespace-pre">{group.stack}</pre>
            : <p className="text-sm text-muted-foreground">Pas de pile transmise.</p>}
        </section>
      </div>
      <section className="mt-8 grid gap-3">
        <h2 className="heading">Derniers exemples</h2>
        {samples.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs">
            {samples.map((s) => (
              <li key={s.id} className="grid min-w-0 gap-1 px-4 py-3 text-sm">
                <span className="flex flex-wrap gap-x-3 text-muted-foreground tabular-nums">
                  <span className="font-semibold text-foreground">{dateTime(s.at)}</span>
                  {s.release && <span>version <code className="font-mono">{s.release}</code></span>}
                  {s.route && <span>{s.route}</span>}
                  <span>{[s.browser, s.os, s.device].filter(Boolean).join(" · ")}</span>
                </span>
                {s.message !== group.message && <span className="wrap-break-word">{s.message}</span>}
                {s.stack && s.stack !== group.stack && (
                  <details><summary className="cursor-pointer text-muted-foreground">Pile de cet exemple</summary>
                    <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre">{s.stack}</pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Aucun exemple gardé (plus de 90 jours, ou plafond du jour atteint).</p>}
      </section>
    </Shell>
  );
}
