import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { addDays, dayRange, MISS_THRESHOLD, rollingActive, type CohortRow, type Period, type StatsFilters } from "@/lib/audience-calc";

/**
 * Requêtes des statistiques d'administration. Règles :
 * - des totaux seulement, jamais une ligne par personne ; aucune adresse, aucun nom ;
 * - chaque requête est bornée dans le temps (la période et la précédente, au plus 2 × 365 jours + 29) et en lignes ;
 * - toute valeur venue de l'URL passe en paramètre lié ; seuls des fragments constants passent par sql.raw.
 * Les personnes comptées sont les étudiants (ni administrateurs ni enseignants), comme dans lib/metrics-server.ts.
 */

type Row = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
/** Valeur de la période et de la précédente (colonne `<clé>_prev`). */
function pair(row: Row, key: string): readonly [number, number];
function pair(row: Row, key: string, read: typeof numOrNull): readonly [number | null, number | null];
function pair(row: Row, key: string, read: (v: unknown) => number | null = num) { return [read(row[key]), read(row[`${key}_prev`])] as const; }
const rowsOf = async <T extends Row>(query: SQL) => (await db.execute<T>(query)).rows;

/** Minuit (heure de Paris) au début d'un jour AAAA-MM-JJ : comparable aux colonnes horodatées, index compris. */
const start = (day: string) => sql`(${day}::date::timestamp at time zone 'Europe/Paris')`;
const after = (day: string) => start(addDays(day, 1));

export const STUDENTS = sql`u.role in ('member', 'contributor', 'delegate')`;
/** Licence et année d'une personne (alias u). La matière ne s'applique qu'aux contenus. */
export const peopleIn = (f: StatsFilters) => sql`(${f.programId}::int is null or u.program_id = ${f.programId}::int) and (${f.level}::int is null or u.level = ${f.level}::int)`;
/** Licence, année et matière d'un document (alias d, matière s). */
const docsIn = (f: StatsFilters) => sql`(${f.programId}::int is null or d.program_id = ${f.programId}::int) and (${f.level}::int is null or s.level = ${f.level}::int) and (${f.subjectId}::int is null or d.subject_id = ${f.subjectId}::int)`;
export const filtered = (f: StatsFilters) => Boolean(f.programId || f.level || f.subjectId);
/** Avec un filtre, seules les pages de cours qui y répondent comptent (alias pv). */
const viewsIn = (f: StatsFilters) => filtered(f)
  ? sql`pv.path like '/d/%' and substring(pv.path from 4 for 36) in (select d.id::text from documents d left join subjects s on s.id = d.subject_id where ${docsIn(f)})`
  : sql`true`;

/**
 * Une personne est active un jour si elle s'est connectée, a lu, révisé, créé une fiche, annoté ou fait un quiz ce
 * jour-là ; et, si elle l'a accepté, si elle a vu une page. Ce sont des données du service : rien n'est collecté pour ça.
 */
const ARMS = [
  ["page_views", "user_id", "at", "user_id is not null and "],
  ["card_reviews", "user_id", "at", ""],
  ["reading_progress", "user_id", "created_at", ""],
  ["reading_progress", "user_id", "updated_at", ""],
  ["revised", "user_id", "at", ""],
  ["flashcards", "user_id", "created_at", ""],
  ["quiz_attempts", "user_id", "at", ""],
  ["annotations", "author_id", "created_at", ""],
  ["sessions", "user_id", "created_at", "not mfa_pending and "],
] as const;
const activity = (lo: SQL, hi: SQL) => sql.join(ARMS.map(([table, user, at, extra]) =>
  sql`select ${sql.raw(user)} as user_id, ${sql.raw(at)} as at from ${sql.raw(table)} where ${sql.raw(extra)}${sql.raw(at)} >= ${lo} and ${sql.raw(at)} < ${hi}`), sql` union all `);
/** Dernière activité de chaque personne : le maximum est pris table par table (index compris), avant de les réunir. */
const lastActivity = (lo: SQL, hi: SQL) => sql.join(ARMS.map(([table, user, at, extra]) =>
  sql`select ${sql.raw(user)} as user_id, max(${sql.raw(at)}) as at from ${sql.raw(table)} where ${sql.raw(extra)}${sql.raw(at)} >= ${lo} and ${sql.raw(at)} < ${hi} group by 1`), sql` union all `);

/**
 * Actifs du jour, des 7 et des 30 derniers jours, pour chaque jour des deux périodes. La base donne, par jour, les
 * personnes actives sous forme de numéros (dense_rank, sans identifiant) ; les fenêtres glissantes se calculent ensuite
 * en un passage (rollingActive) au lieu de trois sous-requêtes par jour (≈ 3 × 60 à 3 × 730 parcours).
 */
export async function activeSeries(f: StatsFilters, p: Period) {
  const rows = await rowsOf<{ day: string; users: number[] }>(sql`
    with acts as (${activity(start(addDays(p.previous.from, -29)), after(p.current.to))}),
    ud as (
      select distinct a.user_id, (a.at at time zone 'Europe/Paris')::date as day
      from acts a join users u on u.id = a.user_id where ${STUDENTS} and ${peopleIn(f)}
    )
    select to_char(day, 'YYYY-MM-DD') as day, array_agg(k) as users
    from (select day, dense_rank() over (order by user_id)::int as k from ud) x group by day`);
  const byDay = new Map(rows.map((r) => [r.day, (r.users ?? []).map(Number)]));
  return rollingActive(byDay, dayRange({ from: p.previous.from, to: p.current.to }));
}

/** Pages vues, visiteurs (avec accord) et comptes (avec accord), sur la période et la précédente. */
export async function traffic(f: StatsFilters, p: Period) {
  const cut = start(p.current.from);
  const [row] = await rowsOf(sql`
    select count(*) filter (where pv.at >= ${cut})::int as views, count(*) filter (where pv.at < ${cut})::int as views_prev,
      count(distinct pv.visitor_id) filter (where pv.at >= ${cut})::int as visitors, count(distinct pv.visitor_id) filter (where pv.at < ${cut})::int as visitors_prev,
      count(distinct pv.user_id) filter (where pv.at >= ${cut})::int as members, count(distinct pv.user_id) filter (where pv.at < ${cut})::int as members_prev
    from page_views pv where pv.at >= ${start(p.previous.from)} and pv.at < ${after(p.current.to)} and ${viewsIn(f)}`);
  return {
    views: [num(row.views), num(row.views_prev)] as const,
    visitors: [num(row.visitors), num(row.visitors_prev)] as const,
    members: [num(row.members), num(row.members_prev)] as const,
  };
}

/** Une série quotidienne { jour, n } sur les deux périodes, à partir d'une colonne horodatée et d'un FROM. */
async function daily(column: SQL, from: SQL, where: SQL, p: Period) {
  // Regroupé par date, mise en texte ensuite : to_char ne tourne qu'une fois par jour, pas une fois par ligne
  const rows = await rowsOf<{ day: string; n: number }>(sql`
    select to_char(x.day, 'YYYY-MM-DD') as day, x.n from (
      select (${column} at time zone 'Europe/Paris')::date as day, count(*)::int as n ${from}
      where ${column} >= ${start(p.previous.from)} and ${column} < ${after(p.current.to)} and ${where}
      group by 1
    ) x`);
  return rows.map((r) => ({ day: r.day, n: num(r.n) }));
}

export const viewsByDay = (f: StatsFilters, p: Period) => daily(sql`pv.at`, sql`from page_views pv`, viewsIn(f), p);
export const signupsByDay = (f: StatsFilters, p: Period) => daily(sql`u.created_at`, sql`from users u`, sql`${STUDENTS} and ${peopleIn(f)}`, p);
/**
 * Sans filtre, les jointures ne changent rien (clés étrangères en cascade : chaque note a sa fiche et sa personne) :
 * on lit card_reviews seule.
 */
const reviewsFrom = (f: StatsFilters) => filtered(f)
  ? { from: sql`from card_reviews c join users u on u.id = c.user_id join flashcards fc on fc.id = c.card_id left join documents d on d.id = fc.document_id`, where: sql`${peopleIn(f)} and (${f.subjectId}::int is null or d.subject_id = ${f.subjectId}::int)` }
  : { from: sql`from card_reviews c`, where: sql`true` };
export const reviewsByDay = (f: StatsFilters, p: Period) => { const r = reviewsFrom(f); return daily(sql`c.at`, r.from, r.where, p); };
export const contributionByDay = (f: StatsFilters, p: Period, kinds: ("sent" | "resubmitted" | "published" | "rejected")[]) => daily(sql`r.created_at`,
  sql`from document_reviews r join documents d on d.id = r.document_id left join subjects s on s.id = d.subject_id`,
  sql`r.kind in (${sql.join(kinds.map((k) => sql`${k}`), sql`, `)}) and ${docsIn(f)}`, p);

const GROUPS = { path: "pv.path", device: "pv.device", browser: "pv.browser", referrer: "pv.referrer" } as const;

/** Classement d'une colonne de page_views, avec le total de la période précédente pour comparer. */
export async function viewsBy(column: keyof typeof GROUPS, f: StatsFilters, p: Period, limit = 10) {
  const col = sql.raw(GROUPS[column]);
  const cut = start(p.current.from);
  const rows = await rowsOf<{ label: string; n: number; prev: number }>(sql`
    select ${col} as label, count(*) filter (where pv.at >= ${cut})::int as n, count(*) filter (where pv.at < ${cut})::int as prev
    from page_views pv where pv.at >= ${start(p.previous.from)} and pv.at < ${after(p.current.to)} and ${col} <> '' and ${viewsIn(f)}
    group by 1 having count(*) filter (where pv.at >= ${cut}) > 0 order by 2 desc, 1 limit ${Math.min(limit, 50)}`);
  return rows.map((r) => ({ label: r.label, n: num(r.n), prev: num(r.prev) }));
}

/** Durée moyenne au premier plan, par page, sur la période (vues chronométrées avec accord seulement). */
export async function durations(keys: string[], p: Period) {
  if (!keys.length) return new Map<string, { views: number; seconds: number }>();
  const rows = await rowsOf<{ key: string; views: number; seconds: number }>(sql`
    select key, sum(n)::int as views, sum(seconds)::bigint as seconds from audience_counters
    where kind = 'time' and day between ${p.current.from}::date and ${p.current.to}::date and key in (${sql.join(keys.slice(0, 100).map((k) => sql`${k}`), sql`, `)})
    group by key`);
  return new Map(rows.map((r) => [r.key, { views: num(r.views), seconds: num(r.seconds) }]));
}

/** Temps total et vues chronométrées de la période et de la précédente (toutes pages). */
export async function timeTotals(p: Period) {
  const [row] = await rowsOf(sql`
    select coalesce(sum(n) filter (where day >= ${p.current.from}::date), 0)::int as views, coalesce(sum(seconds) filter (where day >= ${p.current.from}::date), 0)::bigint as seconds,
      coalesce(sum(n) filter (where day < ${p.current.from}::date), 0)::int as views_prev, coalesce(sum(seconds) filter (where day < ${p.current.from}::date), 0)::bigint as seconds_prev
    from audience_counters where kind = 'time' and day between ${p.previous.from}::date and ${p.current.to}::date`);
  return { views: [num(row.views), num(row.views_prev)] as const, seconds: [num(row.seconds), num(row.seconds_prev)] as const };
}

/** Cours les plus consultés : vues, lecteurs, avancement moyen et durée moyenne de lecture. */
export async function topDocuments(f: StatsFilters, p: Period, limit = 15) {
  const cut = start(p.current.from);
  const rows = await rowsOf(sql`
    with v as (
      select substring(pv.path from 4 for 36) as id, count(*) filter (where pv.at >= ${cut})::int as n, count(*) filter (where pv.at < ${cut})::int as prev
      from page_views pv where pv.path like '/d/%' and pv.at >= ${start(p.previous.from)} and pv.at < ${after(p.current.to)} group by 1
    )
    select d.id, d.title, s.name as subject, v.n, v.prev,
      (select count(*) from reading_progress r where r.document_id = d.id and r.updated_at >= ${cut})::int as readers,
      (select round(avg(r.percent)) from reading_progress r where r.document_id = d.id and r.updated_at >= ${cut})::int as completion,
      (select sum(c.seconds)::float / nullif(sum(c.n), 0) from audience_counters c
        where c.kind = 'time' and c.key = '/d/' || d.id::text and c.day between ${p.current.from}::date and ${p.current.to}::date) as seconds
    from v join documents d on d.id::text = v.id left join subjects s on s.id = d.subject_id
    where d.deleted_at is null and v.n > 0 and ${docsIn(f)}
    order by v.n desc, d.title limit ${Math.min(limit, 50)}`);
  return rows.map((r) => ({ id: String(r.id), title: String(r.title || "Sans titre"), subject: r.subject ? String(r.subject) : null, n: num(r.n), prev: num(r.prev), readers: num(r.readers), completion: numOrNull(r.completion), seconds: numOrNull(r.seconds) }));
}

/** Matières : vues de leurs cours, lecteurs, fiches révisées et cours publiés sur la période. */
export async function subjectsActivity(f: StatsFilters, p: Period, limit = 20) {
  const cut = start(p.current.from);
  const lo = start(p.previous.from);
  const hi = after(p.current.to);
  const rows = await rowsOf(sql`
    with v as (
      select substring(pv.path from 4 for 36) as id, count(*) filter (where pv.at >= ${cut})::int as n, count(*) filter (where pv.at < ${cut})::int as prev
      from page_views pv where pv.path like '/d/%' and pv.at >= ${lo} and pv.at < ${hi} group by 1
    ),
    per as (
      select s.id, s.name, s.level, coalesce(sum(v.n), 0)::int as views, coalesce(sum(v.prev), 0)::int as prev
      from subjects s join documents d on d.subject_id = s.id and d.deleted_at is null left join v on v.id = d.id::text
      where s.archived_at is null and ${docsIn(f)} group by s.id, s.name, s.level
    )
    select per.*,
      (select count(distinct r.user_id) from reading_progress r join documents d on d.id = r.document_id where d.subject_id = per.id and r.updated_at >= ${cut} and r.updated_at < ${hi})::int as readers,
      (select count(*) from card_reviews c join flashcards fc on fc.id = c.card_id join documents d on d.id = fc.document_id where d.subject_id = per.id and c.at >= ${cut} and c.at < ${hi})::int as reviews,
      (select count(*) from documents d where d.subject_id = per.id and d.published and d.deleted_at is null and d.published_at >= ${cut} and d.published_at < ${hi})::int as published
    from per order by views desc, readers desc, per.name limit ${Math.min(limit, 60)}`);
  return rows.map((r) => ({ id: num(r.id), name: String(r.name), level: num(r.level), views: num(r.views), prev: num(r.prev), readers: num(r.readers), reviews: num(r.reviews), published: num(r.published) }));
}

/** Recherches sans résultat : une requête n'apparaît qu'à partir de MISS_THRESHOLD fois sur la période. */
export async function searchMisses(p: Period, limit = 20) {
  const [rows, [total]] = await Promise.all([
    rowsOf<{ key: string; n: number; prev: number }>(sql`
      select key, coalesce(sum(n) filter (where day >= ${p.current.from}::date), 0)::int as n, coalesce(sum(n) filter (where day < ${p.current.from}::date), 0)::int as prev
      from audience_counters where kind = 'miss' and day between ${p.previous.from}::date and ${p.current.to}::date
      group by key having coalesce(sum(n) filter (where day >= ${p.current.from}::date), 0) >= ${MISS_THRESHOLD} order by 2 desc, 1 limit ${Math.min(limit, 50)}`),
    rowsOf(sql`
      select coalesce(sum(n) filter (where day >= ${p.current.from}::date), 0)::int as n, coalesce(sum(n) filter (where day < ${p.current.from}::date), 0)::int as prev
      from audience_counters where kind = 'miss' and day between ${p.previous.from}::date and ${p.current.to}::date`),
  ]);
  return { top: rows.map((r) => ({ label: r.key, n: num(r.n), prev: num(r.prev) })), total: [num(total.n), num(total.prev)] as const };
}

/** Révision : notes données, réviseurs, réussite, temps par fiche, fiches créées, jours de révision, quiz. */
export async function revisionTotals(f: StatsFilters, p: Period) {
  const cut = start(p.current.from);
  const lo = start(p.previous.from);
  const hi = after(p.current.to);
  const subject = sql`(${f.subjectId}::int is null or d.subject_id = ${f.subjectId}::int)`;
  const reviewed = reviewsFrom(f);
  const [[reviews], [cards], [days], [quiz]] = await Promise.all([
    rowsOf(sql`
      select count(*) filter (where c.at >= ${cut})::int as n, count(*) filter (where c.at < ${cut})::int as n_prev,
        count(distinct c.user_id) filter (where c.at >= ${cut})::int as people, count(distinct c.user_id) filter (where c.at < ${cut})::int as people_prev,
        avg((c.grade > 1)::int) filter (where c.at >= ${cut})::float as success, avg((c.grade > 1)::int) filter (where c.at < ${cut})::float as success_prev,
        percentile_cont(0.5) within group (order by c.ms) filter (where c.at >= ${cut} and c.ms > 0) as ms,
        percentile_cont(0.5) within group (order by c.ms) filter (where c.at < ${cut} and c.ms > 0) as ms_prev
      ${reviewed.from}
      where c.at >= ${lo} and c.at < ${hi} and ${reviewed.where}`),
    rowsOf(sql`
      select count(*) filter (where fc.created_at >= ${cut})::int as n, count(*) filter (where fc.created_at < ${cut})::int as n_prev
      from flashcards fc join users u on u.id = fc.user_id left join documents d on d.id = fc.document_id
      where fc.created_at >= ${lo} and fc.created_at < ${hi} and ${peopleIn(f)} and ${subject}`),
    // Jours de révision : une ligne par personne et par jour où elle a révisé (le jour de Réviser commence à 4 h)
    rowsOf(sql`
      select count(*) filter (where sd.day >= ${p.current.from})::int as n, count(*) filter (where sd.day < ${p.current.from})::int as n_prev,
        coalesce(sum(sd.seconds) filter (where sd.day >= ${p.current.from}), 0)::bigint as seconds, coalesce(sum(sd.seconds) filter (where sd.day < ${p.current.from}), 0)::bigint as seconds_prev
      from study_days sd join users u on u.id = sd.user_id
      where sd.day between ${p.previous.from} and ${p.current.to} and (sd.cards > 0 or sd.questions > 0) and ${peopleIn(f)}`),
    rowsOf(sql`
      select count(*) filter (where q.at >= ${cut})::int as n, count(*) filter (where q.at < ${cut})::int as n_prev,
        avg(q.score::float / nullif(q.total, 0)) filter (where q.at >= ${cut}) as score, avg(q.score::float / nullif(q.total, 0)) filter (where q.at < ${cut}) as score_prev
      from quiz_attempts q join users u on u.id = q.user_id join documents d on d.id = q.document_id
      where q.at >= ${lo} and q.at < ${hi} and ${peopleIn(f)} and ${subject}`),
  ]);
  return {
    reviews: pair(reviews, "n"), reviewers: pair(reviews, "people"), success: pair(reviews, "success", numOrNull), msPerCard: pair(reviews, "ms", numOrNull),
    cardsCreated: pair(cards, "n"), studyDays: pair(days, "n"), seconds: pair(days, "seconds"),
    quizzes: pair(quiz, "n"), quizScore: pair(quiz, "score", numOrNull),
  };
}

/** Contribution : envois, publications, refus, corrections, demandes, contributeurs, et les délais médians. */
export async function contributionTotals(f: StatsFilters, p: Period) {
  const cut = start(p.current.from);
  const lo = start(p.previous.from);
  const hi = after(p.current.to);
  const requestsIn = sql`(${f.programId}::int is null or s.program_id = ${f.programId}::int) and (${f.level}::int is null or s.level = ${f.level}::int) and (${f.subjectId}::int is null or s.id = ${f.subjectId}::int)`;
  const [[events], [response], [publication], [corrections], [requests]] = await Promise.all([
    rowsOf(sql`
      select count(*) filter (where r.kind in ('sent', 'resubmitted') and r.created_at >= ${cut})::int as sent, count(*) filter (where r.kind in ('sent', 'resubmitted') and r.created_at < ${cut})::int as sent_prev,
        count(*) filter (where r.kind = 'published' and r.created_at >= ${cut})::int as published, count(*) filter (where r.kind = 'published' and r.created_at < ${cut})::int as published_prev,
        count(*) filter (where r.kind = 'rejected' and r.created_at >= ${cut})::int as rejected, count(*) filter (where r.kind = 'rejected' and r.created_at < ${cut})::int as rejected_prev,
        count(distinct r.author_id) filter (where r.kind in ('sent', 'resubmitted') and r.created_at >= ${cut})::int as authors,
        count(distinct r.author_id) filter (where r.kind in ('sent', 'resubmitted') and r.created_at < ${cut})::int as authors_prev
      from document_reviews r join documents d on d.id = r.document_id left join subjects s on s.id = d.subject_id
      where r.created_at >= ${lo} and r.created_at < ${hi} and ${docsIn(f)}`),
    // Première réponse : de l'envoi à la décision suivante (publié ou renvoyé) ; sans décision, l'envoi attend encore
    rowsOf(sql`
      with sends as (
        select r.created_at as sent_at,
          (select min(r2.created_at) from document_reviews r2 where r2.document_id = r.document_id and r2.kind in ('published', 'rejected') and r2.created_at > r.created_at) as decided_at
        from document_reviews r join documents d on d.id = r.document_id left join subjects s on s.id = d.subject_id
        where r.kind in ('sent', 'resubmitted') and r.created_at >= ${lo} and r.created_at < ${hi} and ${docsIn(f)}
      )
      select percentile_cont(0.5) within group (order by extract(epoch from decided_at - sent_at)) filter (where sent_at >= ${cut} and decided_at is not null) as median,
        percentile_cont(0.5) within group (order by extract(epoch from decided_at - sent_at)) filter (where sent_at < ${cut} and decided_at is not null) as median_prev,
        percentile_cont(0.9) within group (order by extract(epoch from decided_at - sent_at)) filter (where sent_at >= ${cut} and decided_at is not null) as p90,
        count(*) filter (where sent_at >= ${cut} and decided_at is null)::int as waiting
      from sends`),
    // Délai de publication : de la première demande de validation à la publication
    rowsOf(sql`
      select percentile_cont(0.5) within group (order by extract(epoch from d.published_at - d.review_requested_at)) filter (where d.published_at >= ${cut}) as median,
        percentile_cont(0.5) within group (order by extract(epoch from d.published_at - d.review_requested_at)) filter (where d.published_at < ${cut}) as median_prev
      from documents d left join subjects s on s.id = d.subject_id
      where d.published and d.review_requested_at is not null and d.published_at >= d.review_requested_at
        and d.published_at >= ${lo} and d.published_at < ${hi} and d.deleted_at is null and ${docsIn(f)}`),
    rowsOf(sql`
      select count(*) filter (where v.created_at >= ${cut})::int as n, count(*) filter (where v.created_at < ${cut})::int as n_prev,
        count(*) filter (where v.created_at >= ${cut} and v.status = 'accepted')::int as accepted, count(*) filter (where v.created_at < ${cut} and v.status = 'accepted')::int as accepted_prev
      from revisions v join documents d on d.id = v.document_id left join subjects s on s.id = d.subject_id
      where v.created_at >= ${lo} and v.created_at < ${hi} and ${docsIn(f)}`),
    rowsOf(sql`
      select count(*) filter (where cr.created_at >= ${cut})::int as n, count(*) filter (where cr.created_at < ${cut})::int as n_prev,
        count(*) filter (where cr.answered_at >= ${cut})::int as answered, count(*) filter (where cr.answered_at < ${cut} and cr.answered_at >= ${lo})::int as answered_prev,
        percentile_cont(0.5) within group (order by extract(epoch from cr.answered_at - cr.created_at)) filter (where cr.answered_at >= ${cut}) as delay,
        percentile_cont(0.5) within group (order by extract(epoch from cr.answered_at - cr.created_at)) filter (where cr.answered_at < ${cut} and cr.answered_at >= ${lo}) as delay_prev
      from course_requests cr join subjects s on s.id = cr.subject_id
      where cr.merged_into is null and (cr.created_at >= ${lo} or cr.answered_at >= ${lo}) and cr.created_at < ${hi} and ${requestsIn}`),
  ]);
  return {
    sent: pair(events, "sent"), published: pair(events, "published"), rejected: pair(events, "rejected"), authors: pair(events, "authors"),
    firstResponse: pair(response, "median", numOrNull), firstResponseP90: numOrNull(response.p90), waiting: num(response.waiting),
    publication: pair(publication, "median", numOrNull),
    corrections: pair(corrections, "n"), correctionsAccepted: pair(corrections, "accepted"),
    requests: pair(requests, "n"), requestsAnswered: pair(requests, "answered"), requestDelay: pair(requests, "delay", numOrNull),
  };
}

/** Rétention : inscrits de chaque semaine (ou mois) revenus à J+1, J+7 et J+30 ou après. */
export async function cohorts(f: StatsFilters, unit: "week" | "month", count: number, today: string): Promise<CohortRow[]> {
  const trunc = sql.raw(unit === "week" ? "'week'" : "'month'");
  const step = sql.raw(unit === "week" ? "interval '7 days'" : "interval '1 month'");
  const n = Math.min(Math.max(count, 1), 26);
  const rows = await rowsOf(sql`
    with bounds as (select date_trunc(${trunc}, ${today}::date::timestamp) - (${n - 1}::int * ${step}) as lo),
    people as (
      select u.id, u.created_at from users u, bounds
      where ${STUDENTS} and ${peopleIn(f)} and u.created_at >= (bounds.lo at time zone 'Europe/Paris')
    ),
    acts as (${lastActivity(sql`(select lo at time zone 'Europe/Paris' from bounds)`, sql`now() + interval '1 day'`)}),
    seen as (select p.id, p.created_at, max(a.at) as last_at from people p left join acts a on a.user_id = p.id group by p.id, p.created_at)
    select to_char(date_trunc(${trunc}, created_at at time zone 'Europe/Paris'), 'YYYY-MM-DD') as cohort, count(*)::int as signed,
      count(*) filter (where last_at >= created_at + interval '1 day')::int as d1,
      count(*) filter (where last_at >= created_at + interval '7 days')::int as d7,
      count(*) filter (where last_at >= created_at + interval '30 days')::int as d30
    from seen group by 1 order by 1`);
  return rows.map((r) => ({ cohort: String(r.cohort), signed: num(r.signed), d1: num(r.d1), d7: num(r.d7), d30: num(r.d30) }));
}

/** Entonnoir des inscrits de la période (et de la précédente) : jusqu'où chacun est allé, et en combien de temps (médiane). */
export async function funnel(f: StatsFilters, p: Period) {
  const cut = start(p.current.from);
  const rows = await rowsOf(sql`
    with x as (
      select u.created_at, u.status, u.created_at >= ${cut} as is_current,
        (select min(r.created_at) from reading_progress r where r.user_id = u.id) as read_at,
        (select min(fc.created_at) from flashcards fc where fc.user_id = u.id) as card_at,
        (select min(c.at) from card_reviews c where c.user_id = u.id) as review_at,
        (select min(d.published_at) from documents d where d.created_by = u.id and d.published and d.deleted_at is null) as published_at
      from users u where ${STUDENTS} and ${peopleIn(f)} and u.created_at >= ${start(p.previous.from)} and u.created_at < ${after(p.current.to)}
    )
    select is_current, count(*)::int as signed, count(*) filter (where status <> 'unverified')::int as confirmed,
      count(read_at)::int as read, count(card_at)::int as card, count(review_at)::int as review, count(published_at)::int as published,
      percentile_cont(0.5) within group (order by extract(epoch from read_at - created_at)) as read_delay,
      percentile_cont(0.5) within group (order by extract(epoch from card_at - created_at)) as card_delay,
      percentile_cont(0.5) within group (order by extract(epoch from review_at - created_at)) as review_delay,
      percentile_cont(0.5) within group (order by extract(epoch from published_at - created_at)) as published_delay
    from x group by is_current`);
  const pick = (current: boolean) => {
    const r: Row = rows.find((row) => row.is_current === current) ?? {};
    return {
      signed: num(r.signed), confirmed: num(r.confirmed), read: num(r.read), card: num(r.card), review: num(r.review), published: num(r.published),
      delays: { read: numOrNull(r.read_delay), card: numOrNull(r.card_delay), review: numOrNull(r.review_delay), published: numOrNull(r.published_delay) },
    };
  };
  return { current: pick(true), previous: pick(false) };
}

/** Cours publiés sur la période et la précédente. */
export async function publishedTotals(f: StatsFilters, p: Period) {
  const cut = start(p.current.from);
  const [row] = await rowsOf(sql`
    select count(*) filter (where d.published_at >= ${cut})::int as n, count(*) filter (where d.published_at < ${cut})::int as n_prev
    from documents d left join subjects s on s.id = d.subject_id
    where d.published and d.deleted_at is null and d.published_at >= ${start(p.previous.from)} and d.published_at < ${after(p.current.to)} and ${docsIn(f)}`);
  return [num(row.n), num(row.n_prev)] as const;
}

/** Choix des filtres : licences ouvertes et matières non archivées (de la licence et de l'année choisies). */
export async function filterChoices(f: StatsFilters) {
  const [programs, subjects] = await Promise.all([
    rowsOf<{ id: number; name: string }>(sql`select id, name from programs order by position, name`),
    rowsOf<{ id: number; name: string; level: number }>(sql`
      select id, name, level from subjects
      where archived_at is null and (${f.programId}::int is null or program_id = ${f.programId}::int) and (${f.level}::int is null or level = ${f.level}::int)
      order by level, semester nulls first, position, name limit 300`),
  ]);
  return { programs: programs.map((p) => ({ id: num(p.id), name: String(p.name) })), subjects: subjects.map((s) => ({ id: num(s.id), name: String(s.name), level: num(s.level) })) };
}

/** Titres des cours dont l'identifiant figure dans des chemins /d/… (les autres chemins sont ignorés). */
export async function docTitles(paths: string[]) {
  const ids = [...new Set(paths.filter((path) => /^\/d\/[0-9a-f-]{36}/.test(path)).map((path) => path.slice(3, 39)))].slice(0, 100);
  if (!ids.length) return new Map<string, string>();
  const rows = await rowsOf<{ id: string; title: string }>(sql`select id::text as id, title from documents where id::text in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
  return new Map(rows.map((r) => [r.id, r.title || "Sans titre"]));
}
