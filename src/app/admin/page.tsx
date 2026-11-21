import { desc, isNotNull } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminHeaderSimple } from "@/components/admin/admin-header-simple";
import { adminProgram } from "@/components/admin/admin-header";
import { dateTime } from "@/components/admin/badges";
import { Sparkline } from "@/components/admin/sparkline";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Shell } from "@/components/shell";
import { Stat } from "@/components/stat";
import { actionLabel } from "@/lib/admin-actions";
import { adminQueue, dailySeries } from "@/lib/admin-stats";
import { requireAdmin } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { adminPulse } from "@/lib/site-stats";
import { systemChecks } from "@/lib/system-health";
import { IconCards, IconChevronRight, IconContent, IconError, IconFlag, IconHidden, IconMail, IconPeople, IconRequests, IconSuccess, IconTodo, IconUser, IconWarning, type IconData } from "@/lib/icons";

export const metadata: Metadata = { title: "À traiter" };

function Card({ href, icon, count, label }: { href: string; icon: IconData; count: number; label: string }) {
  return (
    <li className="motion-ok:animate-rise">
      <Link href={href} className="group flex min-h-16 items-center gap-3 rounded-xl bg-card px-4 py-3 shadow-xs transition-shadow hover-ok:shadow-sm">
        <span className="flex size-10 items-center justify-center rounded-lg bg-brand-tint text-brand-text"><Icon icon={icon} /></span>
        <span className="grid min-w-0 flex-1"><span className="text-2xl leading-tight font-semibold tabular-nums">{count}</span><span className="text-sm text-muted-foreground">{label}</span></span>
        <Icon icon={IconChevronRight} size={16} className="text-muted-foreground" />
      </Link>
    </li>
  );
}

export default async function AdminHome() {
  const admin = await requireAdmin();
  const program = await adminProgram();
  const [queue, pulse, signups, published, views, logins, checks, recent] = await Promise.all([
    adminQueue(program), adminPulse(), dailySeries("signups"), dailySeries("published"), dailySeries("views"), dailySeries("logins"), systemChecks(),
    db.select().from(schema.auditLog).where(isNotNull(schema.auditLog.level)).orderBy(desc(schema.auditLog.id)).limit(8),
  ]);
  const cards: [string, IconData, number, string][] = [
    ["/admin/personnes?onglet=attente", IconPeople, queue.pending, "demandes d’accès"],
    ["/moderation", IconContent, queue.toValidate, "cours à valider"],
    ["/admin/moderation", IconFlag, queue.openReports, "signalements"],
    ["/admin/moderation?onglet=profils", IconUser, queue.profiles, "profils signalés"],
    ["/admin/moderation?onglet=retraits", IconHidden, queue.withdrawals, queue.withdrawals > 1 ? "demandes de retrait de cours" : "demande de retrait de cours"],
    ["/admin/moderation?onglet=fiches", IconCards, queue.cards, "fiches mémo signalées"],
    ["/admin/moderation?onglet=demandes", IconRequests, queue.staleRequests, "demandes sans réponse depuis 14 jours"],
    ["/admin/systeme", IconMail, queue.failedMails, "mails en échec"],
    ["/admin/contenus?sans_matiere=oui", IconWarning, queue.unfiled, queue.unfiled > 1 ? "cours sans matière" : "cours sans matière"],
    ["/admin/contenus?synchro=erreur", IconError, queue.syncErrors, "synchronisations en erreur"],
  ];
  const visible = cards.filter(([, , n]) => n > 0);
  const red = checks.filter((c) => c.state === "error");
  return (
    <Shell user={admin} width="wide">
      <AdminHeaderSimple title="À traiter" />
      <div className="grid gap-12">
        {red.length > 0 && (
          <ul className="grid gap-2">{red.map((c) => <li key={c.id}><Link href="/admin/systeme" className="flex items-center gap-2 rounded-xl bg-destructive-tint px-4 py-3 text-sm font-semibold text-destructive-foreground"><Icon icon={IconError} size={16} />{c.label} : {c.detail}</Link></li>)}</ul>
        )}
        {visible.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>li:nth-child(2)]:[animation-delay:30ms] [&>li:nth-child(3)]:[animation-delay:60ms] [&>li:nth-child(4)]:[animation-delay:90ms]">
            {visible.map(([href, icon, n, label]) => <Card key={href} href={href} icon={icon} count={n} label={label} />)}
          </ul>
        ) : <EmptyState icon={IconTodo} title="Rien à traiter" description="Les demandes, signalements et cours à valider apparaîtront ici." />}
        <section className="grid gap-4">
          <h2 className="heading">Pouls · 14 jours</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {([[pulse.signups, "inscriptions en 7 j", signups], [pulse.published, "publications en 7 j", published], [views.reduce((a, b) => a + b, 0), "pages vues", views], [logins.at(-1) ?? 0, "connexions aujourd’hui", logins]] as const).map(([value, label, series]) => (
              <div key={label} className="grid gap-2 rounded-xl bg-card p-4 shadow-xs"><Stat value={value.toLocaleString("fr-FR")} label={label} /><Sparkline values={[...series]} label={`Évolution : ${label}`} /></div>
            ))}
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {checks.map((c) => <Link key={c.id} href="/admin/systeme" className="flex items-center gap-1.5 hover:text-foreground"><Icon icon={c.state === "ok" ? IconSuccess : c.state === "warn" ? IconWarning : IconError} size={16} className={c.state === "ok" ? "text-success-foreground" : c.state === "warn" ? "text-warning-foreground" : "text-destructive-foreground"} />{c.label}</Link>)}
          </p>
        </section>
        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-3"><h2 className="heading">Activité récente des admins</h2><Link href="/admin/journal" className="text-sm text-link hover:underline">Journal</Link></div>
          {recent.length ? <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card text-sm shadow-xs">{recent.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2.5"><span className="min-w-0"><span className="font-semibold">{actionLabel(r.action)}</span>{r.targetLabel || r.target ? <span className="text-muted-foreground"> · {r.targetLabel || r.target}</span> : null}</span><span className="shrink-0 tabular-nums text-muted-foreground">{r.actor} · {dateTime(r.at)}</span></li>
          ))}</ul> : <p className="text-sm text-muted-foreground">Rien pour l’instant</p>}
        </section>
      </div>
    </Shell>
  );
}
