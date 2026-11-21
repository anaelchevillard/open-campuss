import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { coverageOf, type Share } from "./metrics";
import { TtlCache } from "./ttl-cache";

const { documents, programs, subjects } = schema;

/**
 * Aucune de ces requêtes ne lit page_views : elles ne dépendent donc pas du consentement au suivi,
 * et elles ne renvoient que des totaux, jamais une ligne par personne.
 * Les comptes comptés sont les étudiants actifs : ni les administrateurs, ni les enseignants.
 */
async function audience() {
  const { rows } = await db.execute<Record<string, number>>(sql`
    with students as (
      select id, created_at from users where status = 'active' and role in ('member', 'contributor', 'delegate')
    ),
    traces as (
      select user_id, last_seen_at as at from sessions where not mfa_pending
      union all select id, last_login_at from users where last_login_at is not null
      union all select user_id, updated_at from reading_progress
      union all select user_id, at from revised
      union all select user_id, created_at from flashcards
      union all select user_id, last_reviewed_at from flashcards where last_reviewed_at is not null
    ),
    seen as (select user_id, max(at) as at from traces group by user_id),
    people as (
      select s.id, s.created_at, seen.at as seen_at,
        s.created_at <= now() - interval '7 days' and s.created_at > now() - interval '97 days' as in_week_cohort,
        s.created_at <= now() - interval '30 days' and s.created_at > now() - interval '120 days' as in_month_cohort
      from students s left join seen on seen.user_id = s.id
    )
    select
      count(*)::int as total,
      count(*) filter (where seen_at > now() - interval '7 days')::int as weekly,
      count(*) filter (where in_week_cohort)::int as week_cohort,
      count(*) filter (where in_week_cohort and seen_at >= created_at + interval '7 days')::int as back7,
      count(*) filter (where in_month_cohort)::int as month_cohort,
      count(*) filter (where in_month_cohort and seen_at >= created_at + interval '30 days')::int as back30,
      count(*) filter (where in_week_cohort
        and (exists (select 1 from reading_progress r where r.user_id = people.id and r.created_at < people.created_at + interval '7 days')
          or exists (select 1 from revised r where r.user_id = people.id and r.at < people.created_at + interval '7 days'))
        and exists (select 1 from flashcards f where f.user_id = people.id and f.created_at < people.created_at + interval '7 days'))::int as activated,
      count(*) filter (where exists (
        select 1 from documents d left join doc_authors a on a.document_id = d.id and a.user_id = people.id
        where (d.created_by = people.id or a.user_id is not null)
          -- Un brouillon naît au premier clic : il n'y a dépôt qu'une fois envoyé ou publié
          and (d.published or d.review_requested or d.review_requested_at is not null or d.published_at is not null)
      ))::int as contributors,
      count(*) filter (where exists (select 1 from flashcards f where f.user_id = people.id and f.last_reviewed_at > now() - interval '7 days'))::int as reviewers
    from people
  `);
  return rows[0];
}

async function validation() {
  const { rows } = await db.execute<{ median: string | null; count: number; waiting: number }>(sql`
    select
      percentile_cont(0.5) within group (order by extract(epoch from published_at - review_requested_at)) filter (where validated) as median,
      count(*) filter (where validated)::int as count,
      count(*) filter (where review_requested)::int as waiting
    from (
      -- Une date de publication antérieure à la demande veut dire que le cours revient d'un retrait : elle ne mesure rien
      select published_at, review_requested_at, review_requested,
        published and published_at >= review_requested_at and published_at > now() - interval '90 days' as validated
      from documents
    ) d
  `);
  const row = rows[0];
  return { medianSeconds: row.median === null ? null : Number(row.median), count: row.count, waiting: row.waiting };
}

const coverage = async () => coverageOf(await db.select({
  programId: programs.id, program: programs.name, level: subjects.level, subjectId: subjects.id, subject: subjects.name,
  courses: sql<number>`count(${documents.id})::int`,
}).from(subjects).innerJoin(programs, and(eq(subjects.programId, programs.id), eq(programs.active, true)))
  .leftJoin(documents, and(eq(documents.subjectId, subjects.id), eq(documents.category, "cours"), and(eq(documents.published, true), isNull(documents.deletedAt)), eq(documents.hiddenByReports, false)))
  .groupBy(programs.id, programs.name, programs.position, subjects.level, subjects.id, subjects.name, subjects.position)
  .orderBy(asc(programs.position), asc(programs.name), asc(subjects.level), asc(subjects.position), asc(subjects.id)));

/**
 * Totaux de toute la base, identiques pour tous les administrateurs (aucune donnée propre à qui regarde) et coûteux
 * (ils parcourent tout l'historique) : gardés 5 minutes en mémoire, un seul calcul pour des visites simultanées.
 */
const METRICS_TTL_MS = 5 * 60_000;
const globals = globalThis as unknown as { campusMetricsCache?: TtlCache<Metrics> };
const metricsCache = (globals.campusMetricsCache ??= new TtlCache<Metrics>(1, METRICS_TTL_MS));
type Metrics = Awaited<ReturnType<typeof computeMetrics>>;

export const loadMetrics = () => metricsCache.getOrLoad("all", computeMetrics);

async function computeMetrics() {
  const [people, delay, covered] = await Promise.all([audience(), validation(), coverage()]);
  const share = (n: number, total: number): Share => ({ n, total });
  return {
    coverage: covered,
    activation: share(people.activated, people.week_cohort),
    weekly: share(people.weekly, people.total),
    back7: share(people.back7, people.week_cohort),
    back30: share(people.back30, people.month_cohort),
    contributors: share(people.contributors, people.total),
    reviewers: share(people.reviewers, people.total),
    validation: delay,
  };
}
