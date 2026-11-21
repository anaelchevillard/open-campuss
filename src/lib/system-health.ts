import "server-only";
import { readFile, stat } from "node:fs/promises";
import { count, desc, gt, like, max, sql } from "drizzle-orm";
import { pingAntivirus, antivirusEnabled } from "./clamav";
import { db, schema } from "./db";
import { diskUsage } from "./disk-alert";
import { DISK_ALERT_PERCENT } from "./disk";
import { aiUsageSummary } from "./ai/ledger";
import { env } from "./env";
import { featureOn } from "./site-settings";

export type Check = { id: string; label: string; state: "ok" | "warn" | "error" | "off"; detail: string };

const BACKUP_MAX_HOURS = 36;
const hoursSince = (d: Date) => (Date.now() - d.getTime()) / 3_600_000;

/** Dernière sauvegarde, en lecture seule : JSON { at } ou date ISO sur la première ligne, sinon la date du fichier. */
export async function backupStatus(): Promise<{ at: Date | null; detail: string } | null> {
  if (!env.backupStatusFile) return null;
  try {
    const text = (await readFile(env.backupStatusFile, "utf8")).slice(0, 4000);
    let at: Date | null = null;
    let detail = "";
    try {
      const json = JSON.parse(text) as { at?: string; size?: string; note?: string };
      at = json.at ? new Date(json.at) : null;
      detail = [json.size, json.note].filter(Boolean).join(" · ");
    } catch {
      const first = text.split(/\r?\n/)[0]?.trim();
      at = first && !Number.isNaN(Date.parse(first)) ? new Date(first) : null;
    }
    if (!at) at = (await stat(env.backupStatusFile)).mtime;
    return { at, detail };
  } catch {
    return { at: null, detail: "fichier illisible" };
  }
}

/** Santé du site, pour la page Système et les pastilles d'À traiter. Chaque vérification échoue seule. */
export async function systemChecks(): Promise<Check[]> {
  const safe = async (fn: () => Promise<Check>, id: string, label: string): Promise<Check> => fn().catch(() => ({ id, label, state: "error" as const, detail: "vérification impossible" }));
  return Promise.all([
    safe(async () => {
      const start = performance.now();
      await db.execute(sql`select 1`);
      const ms = Math.round(performance.now() - start);
      return { id: "db", label: "Base", state: ms > 500 ? "warn" : "ok", detail: `${ms} ms` };
    }, "db", "Base"),
    safe(async () => {
      if (!env.smtpEnabled) return { id: "mail", label: "Mails", state: "error", detail: "SMTP non configuré" };
      const [q] = await db.select({ n: count(), failed: sql<number>`count(*) filter (where ${schema.outbox.attempts} > 0)::int` }).from(schema.outbox);
      return { id: "mail", label: "Mails", state: q.failed > 0 ? "warn" : "ok", detail: `${q.n} en file${q.failed ? `, ${q.failed} en échec` : ""}` };
    }, "mail", "Mails"),
    safe(async () => {
      if (!antivirusEnabled()) return { id: "av", label: "Antivirus", state: "off", detail: "non configuré" };
      return (await pingAntivirus()) ? { id: "av", label: "Antivirus", state: "ok", detail: "répond" } : { id: "av", label: "Antivirus", state: "error", detail: "ne répond pas" };
    }, "av", "Antivirus"),
    safe(async () => {
      const disk = await diskUsage();
      if (!disk) return { id: "disk", label: "Disque", state: "off", detail: "non mesurable ici" };
      return { id: "disk", label: "Disque", state: disk.percent >= 90 ? "error" : disk.percent >= DISK_ALERT_PERCENT ? "warn" : "ok", detail: `${disk.percent} % utilisés, ${Math.floor(disk.freeBytes / 1024 ** 3)} Go libres` };
    }, "disk", "Disque"),
    safe(async () => {
      const b = await backupStatus();
      if (!b) return { id: "backup", label: "Sauvegardes", state: "off", detail: "non renseigné" };
      if (!b.at) return { id: "backup", label: "Sauvegardes", state: "error", detail: b.detail };
      const h = hoursSince(b.at);
      return { id: "backup", label: "Sauvegardes", state: h > BACKUP_MAX_HOURS ? "error" : "ok", detail: `il y a ${Math.round(h)} h${b.detail ? ` · ${b.detail}` : ""}` };
    }, "backup", "Sauvegardes"),
  ]);
}

/** Détails de la page Système (lecture seule). */
export async function systemDetails() {
  const [size, migrations, runs, ai, storage, push, failed, aiSwitch, aiSpend] = await Promise.all([
    db.execute(sql`select pg_size_pretty(pg_database_size(current_database())) as size`).then((r) => (r.rows[0] as { size: string }).size).catch(() => "?"),
    db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`).then((r) => Number((r.rows[0] as { n: number }).n)).catch(() => null),
    db.select().from(schema.scheduledRuns).orderBy(desc(schema.scheduledRuns.at)),
    db.select({ at: max(schema.rateEvents.at) }).from(schema.rateEvents).where(like(schema.rateEvents.key, "ai:%")).then((r) => r[0]?.at ?? null),
    db.select({ files: count(), bytes: sql<number>`coalesce(sum(${schema.docFiles.size}), 0)::float` }).from(schema.docFiles).then((r) => r[0]),
    db.select({ n: count() }).from(schema.pushSubscriptions).then((r) => r[0].n),
    db.select().from(schema.outbox).where(gt(schema.outbox.attempts, 0)).orderBy(desc(schema.outbox.id)).limit(10),
    featureOn("ai"),
    aiUsageSummary().catch(() => null),
  ]);
  return {
    size, migrations, runs, aiLast: ai, storage, push, failed,
    version: (process.env.GIT_SHA ?? process.env.SOURCE_COMMIT ?? "").slice(0, 12) || null,
    // État réel : la clé lue dans l'environnement du conteneur à cet instant, puis l'interrupteur des Réglages et une pause éventuelle
    aiConfigured: Boolean(env.aiApiKey), aiSwitch, aiSpend, aiModel: env.aiModel, aiModelLight: env.aiModelLight, pushConfigured: env.pushEnabled, smtp: env.smtpEnabled,
  };
}
