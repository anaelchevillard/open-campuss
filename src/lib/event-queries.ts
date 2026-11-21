import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { RETENTION_WEEKS, type CohortRow, type Period, type StatsFilters, type WeeklyCohortRow } from "@/lib/audience-calc";
import { peopleIn, STUDENTS } from "@/lib/audience-queries";
import { PRODUCT_EVENTS, type ProductEvent } from "@/lib/product-event-catalog";

/**
 * Statistiques des événements produits. Mêmes règles que lib/audience-queries.ts : des totaux,
 * des fenêtres bornées, des valeurs de l'URL en paramètres liés, seulement des constantes en sql.raw.
 */

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/** Activité par événement : totaux du jour (tout le monde, sans identifiant), période et précédente. */
export async function eventTotals(p: Period) {
  const { rows } = await db.execute<{ name: string; n: number; n_prev: number }>(sql`
    select name,
      coalesce(sum(n) filter (where day >= ${p.current.from}::date and day <= ${p.current.to}::date), 0)::int as n,
      coalesce(sum(n) filter (where day >= ${p.previous.from}::date and day <= ${p.previous.to}::date), 0)::int as n_prev
    from product_event_counts where day >= ${p.previous.from}::date and day <= ${p.current.to}::date
    group by name`);
  const byName = new Map(rows.map((r) => [r.name, r]));
  return (Object.keys(PRODUCT_EVENTS) as ProductEvent[]).map((name) => ({
    name, label: PRODUCT_EVENTS[name], n: num(byName.get(name)?.n), prev: num(byName.get(name)?.n_prev),
  }));
}

/** Personnes distinctes ayant au moins un événement lié (avec accord) sur la période : la base des courbes. */
export async function consentedPeople(f: StatsFilters, p: Period) {
  const { rows } = await db.execute<{ n: number }>(sql`
    select count(distinct e.user_id)::int as n from product_events e join users u on u.id = e.user_id
    where ${STUDENTS} and ${peopleIn(f)}
      and e.at >= (${p.current.from}::date::timestamp at time zone 'Europe/Paris') and e.at < ((${p.current.to}::date + 1)::timestamp at time zone 'Europe/Paris')`);
  return num(rows[0]?.n);
}

/**
 * Cohortes hebdomadaires des personnes qui ont accepté la mesure : la cohorte est la semaine de leur premier
 * événement lié. Revenues à J+1, J+7, J+30 (au moins un événement k jours ou plus après), et actives chaque semaine
 * 1 à 8. Sans accord, aucun événement n'est lié : ces personnes n'entrent pas dans les cohortes.
 */
export async function eventCohorts(f: StatsFilters, count: number, today: string): Promise<{ days: CohortRow[]; weeks: WeeklyCohortRow[] }> {
  const n = Math.min(Math.max(count, 1), 26);
  const weekly = sql.join(Array.from({ length: RETENTION_WEEKS }, (_, i) => i + 1).map((w) =>
    sql.raw(`count(distinct e.user_id) filter (where e.at >= p.first_at + interval '${7 * w} days' and e.at < p.first_at + interval '${7 * (w + 1)} days')::int as w${w}`)), sql`, `);
  const { rows } = await db.execute<Record<string, unknown>>(sql`
    with bounds as (select (date_trunc('week', ${today}::date::timestamp) - (${n - 1}::int * interval '7 days')) at time zone 'Europe/Paris' as lo),
    firsts as (
      select e.user_id, min(e.at) as first_at from product_events e join users u on u.id = e.user_id
      where ${STUDENTS} and ${peopleIn(f)} group by e.user_id
    ),
    people as (select user_id, first_at from firsts, bounds where first_at >= bounds.lo)
    select to_char(date_trunc('week', p.first_at at time zone 'Europe/Paris'), 'YYYY-MM-DD') as cohort,
      count(distinct p.user_id)::int as signed,
      count(distinct e.user_id) filter (where e.at >= p.first_at + interval '1 day')::int as d1,
      count(distinct e.user_id) filter (where e.at >= p.first_at + interval '7 days')::int as d7,
      count(distinct e.user_id) filter (where e.at >= p.first_at + interval '30 days')::int as d30,
      ${weekly}
    from people p left join product_events e on e.user_id = p.user_id
    group by 1 order by 1`);
  return {
    days: rows.map((r) => ({ cohort: String(r.cohort), signed: num(r.signed), d1: num(r.d1), d7: num(r.d7), d30: num(r.d30) })),
    weeks: rows.map((r) => ({ cohort: String(r.cohort), signed: num(r.signed), weeks: Array.from({ length: RETENTION_WEEKS }, (_, i) => num(r[`w${i + 1}`])) })),
  };
}
