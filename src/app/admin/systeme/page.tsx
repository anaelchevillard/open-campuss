import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/admin-header";
import { dateTime } from "@/components/admin/badges";
import { SystemActions } from "@/components/admin/system-actions";
import { Icon } from "@/components/icon";
import { Shell } from "@/components/shell";
import { requireAdmin } from "@/lib/auth";
import { budgetLevel, budgetPercent } from "@/lib/ai/budget";
import { backupStatus, systemChecks, systemDetails } from "@/lib/system-health";
import { IconError, IconSuccess, IconWarning, IconInfo } from "@/lib/icons";

export const metadata: Metadata = { title: "Système" };

const STATE = { ok: [IconSuccess, "text-success-foreground", "Bon"], warn: [IconWarning, "text-warning-foreground", "Attention"], error: [IconError, "text-destructive-foreground", "Problème"], off: [IconInfo, "text-muted-foreground", "Inactif"] } as const;
const gb = (bytes: number) => `${(bytes / 1024 ** 3).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Go`;
const nf = (n: number) => Math.round(n).toLocaleString("fr-FR");
const late = (day: string) => day < new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);

function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: keyof typeof STATE }) {
  const [icon, color, word] = STATE[tone ?? "off"];
  return (
    <li className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
      {tone && <Icon icon={icon} size={16} className={color} label={word} />}
      <span className="font-semibold">{label}</span>
      <span className="ml-auto text-right text-muted-foreground">{value}</span>
    </li>
  );
}

/** Santé du site, en lecture seule : base, mails, antivirus, disque, stockage, tâches, IA, push, version, sauvegardes. */
export default async function SystemPage() {
  const admin = await requireAdmin();
  const [checks, d, backup] = await Promise.all([systemChecks(), systemDetails(), backupStatus()]);
  const check = (id: string) => checks.find((c) => c.id === id)!;
  const models = d.aiModelLight !== d.aiModel ? `${d.aiModel}, classement ${d.aiModelLight}` : d.aiModel;
  const [aiTone, aiState]: [keyof typeof STATE, string] = !d.aiConfigured ? ["off", "absente : pas de AI_API_KEY dans l’environnement"]
    : !d.aiSwitch ? ["off", `coupée dans Réglages · ${models}`]
      : d.aiSpend?.pause ? ["error", `en pause (${d.aiSpend.pause.reason === "budget" ? "limite du jour atteinte" : "refus du fournisseur"}) · ${models}`]
        : ["ok", `${models}${d.aiLast ? ` · dernier appel ${dateTime(d.aiLast)}` : ""}`];
  const spend = d.aiSpend;
  const level = spend ? budgetLevel(spend.used, spend.budget) : "ok";
  return (
    <Shell user={admin} width="wide">
      <AdminHeader title="Système" section="suivi" current="/admin/systeme" program={false} action={<SystemActions smtp={d.smtp} failed={d.failed.length} />} />
      <div className="grid gap-10 lg:grid-cols-2">
        <section className="grid content-start gap-3">
          <h2 className="heading">Services</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs">
            <Row label="Base" tone={check("db").state} value={`${check("db").detail} · ${d.size}${d.migrations !== null ? ` · ${d.migrations} migrations` : ""}`} />
            <Row label="Mails" tone={check("mail").state} value={check("mail").detail} />
            <Row label="Antivirus" tone={check("av").state} value={check("av").detail} />
            <Row label="Disque" tone={check("disk").state} value={check("disk").detail} />
            <Row label="Stockage des cours" value={`${d.storage.files.toLocaleString("fr-FR")} fichiers · ${gb(d.storage.bytes)}`} />
            <Row label="Campuss IA" tone={aiTone} value={aiState} />
            <Row label="Notifications push" tone={d.pushConfigured ? "ok" : "off"} value={d.pushConfigured ? `${d.push} appareils` : "absent"} />
            <Row label="Version" value={d.version ? <code className="font-mono">{d.version}</code> : "non renseignée"} />
          </ul>
        </section>
        {spend && (
          <section className="grid content-start gap-3">
            <h2 className="heading">Consommation de Campuss IA</h2>
            <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs">
              <Row label="Budget du jour" tone={level === "over" ? "error" : level === "alert" ? "warn" : "ok"} value={`${budgetPercent(spend.used, spend.budget)} % de ${nf(spend.budget)} jetons · plafond ${nf(spend.maxCalls)} appels`} />
              {spend.periods.map((p) => (
                <Row key={p.label} label={p.label} tone={p.errors ? "warn" : undefined} value={`${nf(p.calls)} appels · ${nf(p.inputTokens)} jetons en entrée · ${nf(p.outputTokens)} en sortie${p.errors ? ` · ${nf(p.errors)} erreurs` : ""}`} />
              ))}
            </ul>
          </section>
        )}
        <section className="grid content-start gap-3">
          <h2 className="heading">Sauvegardes</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs">
            <Row label="Dernière sauvegarde" tone={check("backup").state} value={backup?.at ? `${dateTime(backup.at)} · ${check("backup").detail}` : check("backup").detail} />
          </ul>
          <h2 className="heading mt-6">Tâches planifiées</h2>
          {d.runs.length ? (
            <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs">
              {d.runs.map((r) => <Row key={r.name} label={r.name} tone={late(r.day) ? "error" : "ok"} value={`${dateTime(r.at)}${late(r.day) ? " · en retard" : ""}`} />)}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Aucune exécution enregistrée</p>}
          {d.failed.length > 0 && (
            <>
              <h2 className="heading mt-6">Mails en échec</h2>
              <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card text-sm shadow-xs">
                {d.failed.map((m) => <li key={m.id} className="grid gap-0.5 px-4 py-2"><span className="font-semibold wrap-break-word">{m.recipient}</span><span className="text-muted-foreground wrap-break-word">{m.attempts} essais · {m.lastError}</span></li>)}
              </ul>
            </>
          )}
        </section>
      </div>
    </Shell>
  );
}
