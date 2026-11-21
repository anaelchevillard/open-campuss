import "server-only";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export const ERROR_STATUSES = ["open", "resolved", "ignored"] as const;
export type ErrorStatus = (typeof ERROR_STATUSES)[number];
export const STATUS_LABEL: Record<ErrorStatus, string> = { open: "Ouverte", resolved: "Résolue", ignored: "Ignorée" };

const LIST_LIMIT = 100;
const SAMPLES = 20;

export type Share = { label: string; n: number };
export type GroupStats = { touched: number; browsers: Share[]; systems: Share[]; releases: Share[]; routes: Share[] };

/** Filtre de la liste lu dans l'URL : un statut connu, sinon les erreurs ouvertes. « toutes » montre tout. */
export function statusFilter(raw: unknown): ErrorStatus | "all" {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "toutes") return "all";
  return (ERROR_STATUSES as readonly string[]).includes(String(value)) ? (value as ErrorStatus) : "open";
}

/** Erreurs regroupées, les plus récentes d'abord, 100 au plus. */
export async function errorList(status: ErrorStatus | "all") {
  const g = schema.errorGroups;
  const rows = await db.select().from(g).where(status === "all" ? undefined : eq(g.status, status)).orderBy(desc(g.lastSeen)).limit(LIST_LIMIT);
  const stats = await statsOf(rows.map((r) => r.id));
  return rows.map((row) => ({ ...row, stats: stats.get(row.id) ?? empty() }));
}

export async function errorCounts() {
  const g = schema.errorGroups;
  const rows = await db.select({ status: g.status, n: sql<number>`count(*)::int` }).from(g).groupBy(g.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<ErrorStatus, number>>;
}

/** Une erreur, ses derniers exemples et ses répartitions. */
export async function errorDetail(id: number) {
  const g = schema.errorGroups;
  const e = schema.errorEvents;
  const [group] = await db.select().from(g).where(eq(g.id, id)).limit(1);
  if (!group) return null;
  const [samples, stats] = await Promise.all([
    db.select().from(e).where(eq(e.groupId, id)).orderBy(desc(e.at)).limit(SAMPLES),
    statsOf([id], 6),
  ]);
  return { group, samples, stats: stats.get(id) ?? empty() };
}

const empty = (): GroupStats => ({ touched: 0, browsers: [], systems: [], releases: [], routes: [] });

/**
 * Répartitions sur les exemples gardés (100 par jour et par erreur au plus) : personnes touchées approximatives
 * (empreintes du jour distinctes, une même personne compte une fois par jour), navigateurs, systèmes, versions, routes.
 */
async function statsOf(ids: number[], top = 3) {
  const out = new Map<number, GroupStats>();
  if (!ids.length) return out;
  const e = schema.errorEvents;
  const touched = await db.select({ id: e.groupId, n: sql<number>`count(distinct (${e.at} at time zone 'Europe/Paris')::date::text || ${e.reporter}) filter (where ${e.reporter} <> '')::int` })
    .from(e).where(inArray(e.groupId, ids)).groupBy(e.groupId);
  const shares = await db.execute<{ id: number; k: string; v: string; n: number }>(sql`
    select group_id as id, k, v, n from (
      select group_id, k, v, count(*)::int as n, row_number() over (partition by group_id, k order by count(*) desc) as rank
      from error_events, lateral (values ('b', browser), ('o', os), ('r', release), ('p', route)) as kv(k, v)
      where group_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) and v <> ''
      group by group_id, k, v
    ) ranked where rank <= ${top} order by id, k, n desc`);
  for (const id of ids) out.set(id, empty());
  for (const row of touched) out.get(row.id)!.touched = row.n;
  const field = { b: "browsers", o: "systems", r: "releases", p: "routes" } as const;
  for (const row of shares.rows) out.get(Number(row.id))?.[field[row.k as keyof typeof field]].push({ label: row.v, n: Number(row.n) });
  return out;
}
