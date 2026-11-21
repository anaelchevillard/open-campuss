import { ActiveChart, BarList, TrendChart } from "@/components/admin/stats/charts";
import { FunnelChart, RetentionGrid } from "@/components/admin/stats/cohorts";
import { cmp, seriesOf, type StatsContext } from "@/components/admin/stats/context";
import { Indicators } from "@/components/admin/stats/indicators";
import { Kpi, Panel } from "@/components/admin/stats/trend";
import { compare, formatSeconds, funnelView, meanOf, percent, retentionTable, sumOf, weeklyRetention, type FunnelStep, type SeriesPoint } from "@/lib/audience-calc";
import { consentedPeople, eventCohorts, eventTotals } from "@/lib/event-queries";
import {
  activeSeries, cohorts, docTitles, durations, filtered, funnel, publishedTotals, reviewsByDay, searchMisses, signupsByDay, timeTotals, traffic, viewsBy, viewsByDay,
} from "@/lib/audience-queries";
import { loadMetrics } from "@/lib/metrics-server";

const fr = (n: number) => n.toLocaleString("fr-FR");

async function activity(ctx: StatsContext) {
  const rows = await activeSeries(ctx.f, ctx.p);
  const pick = (key: "dau" | "wau" | "mau") => rows.map((r) => ({ day: r.day, n: r[key] }));
  // Sur 90 jours et plus, un point par semaine : la moyenne des actifs du jour, la dernière valeur des fenêtres glissantes
  const dauDaily = seriesOf({ ...ctx, bucket: 1 }, pick("dau"));
  const series = {
    dau: seriesOf(ctx, pick("dau"), "mean"),
    wau: seriesOf(ctx, pick("wau"), "last"),
    mau: seriesOf(ctx, pick("mau"), "last"),
  };
  const last = (s: SeriesPoint[]) => [s.at(-1)?.current ?? 0, s.at(-1)?.previous ?? null] as const;
  const dau = [meanOf(dauDaily, "current"), meanOf(dauDaily, "previous")] as const;
  const mau = last(series.mau);
  return { series, dau, wau: last(series.wau), mau, stickiness: [mau[0] ? dau[0] / mau[0] : null, mau[1] ? dau[1] / mau[1] : null] as const };
}

const cohortShape = (days: number) => (days >= 365 ? { unit: "month" as const, count: 12 } : { unit: "week" as const, count: Math.max(8, Math.ceil(days / 7)) });

/** Vue d'ensemble : les chiffres clés, chacun menant à son détail, et les deux courbes principales. */
export async function OverviewView({ ctx }: { ctx: StatsContext }) {
  const shape = cohortShape(ctx.p.days);
  const [visits, active, signups, published, reviews, misses, cohortRows, metrics, views] = await Promise.all([
    traffic(ctx.f, ctx.p), activity(ctx), signupsByDay(ctx.f, ctx.p), publishedTotals(ctx.f, ctx.p), reviewsByDay(ctx.f, ctx.p),
    searchMisses(ctx.p, 1), cohorts(ctx.f, shape.unit, shape.count, ctx.p.current.to), loadMetrics(), viewsByDay(ctx.f, ctx.p),
  ]);
  const signupSeries = seriesOf(ctx, signups);
  const reviewSeries = seriesOf(ctx, reviews);
  const retention = retentionTable(cohortRows, ctx.p.current.to, shape.unit).average;
  return (
    <div className="grid gap-8">
      <section aria-label="Chiffres clés" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={filtered(ctx.f) ? "Pages de cours vues" : "Pages vues"} value={fr(visits.views[0])} comparison={cmp(visits.views)} href={ctx.href({ vue: "audience" })} />
        <Kpi label="Actifs par jour" value={fr(Math.round(active.dau[0]))} comparison={compare(Math.round(active.dau[0]), Math.round(active.dau[1]))} hint="moyenne de la période" href={ctx.href({ vue: "audience" })} />
        <Kpi label="Actifs sur 30 jours" value={fr(active.mau[0])} comparison={cmp(active.mau)} hint="au dernier jour" href={ctx.href({ vue: "audience" })} />
        <Kpi label="Inscriptions" value={fr(sumOf(signupSeries, "current"))} comparison={compare(sumOf(signupSeries, "current"), sumOf(signupSeries, "previous"))} href={ctx.href({ vue: "retention" })} />
        <Kpi label="Retour à J+7" value={percent(retention[1].rate)} hint={`moyenne des cohortes ${shape.unit === "week" ? "hebdomadaires" : "mensuelles"} mûres`} href={ctx.href({ vue: "retention" })} />
        <Kpi label="Fiches révisées" value={fr(sumOf(reviewSeries, "current"))} comparison={compare(sumOf(reviewSeries, "current"), sumOf(reviewSeries, "previous"))} href={ctx.href({ vue: "revision" })} />
        <Kpi label="Cours publiés" value={fr(published[0])} comparison={cmp(published)} href={ctx.href({ vue: "contribution" })} />
        <Kpi label="Recherches sans résultat" value={fr(misses.total[0])} comparison={cmp(misses.total)} better="down" hint="avec accord à la mesure" href={`${ctx.href({ vue: "contenus" })}#recherche`} />
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel id="actifs-ensemble" title="Utilisateurs actifs" lead="Étudiants qui se sont connectés, ont lu, révisé, annoté ou fait un quiz.">
          <ActiveChart series={active.series} shift={ctx.p.days} bucket={ctx.bucket} />
        </Panel>
        <Panel id="vues-ensemble" title={filtered(ctx.f) ? "Pages de cours vues" : "Pages vues"} lead={ctx.bucket > 1 ? "Par semaine." : "Par jour."}>
          <TrendChart data={seriesOf(ctx, views)} label="Pages vues" shift={ctx.p.days} bucket={ctx.bucket} />
        </Panel>
      </div>
      <Indicators metrics={metrics} />
    </div>
  );
}

/** Audience : actifs J/S/M, pages vues, pages, appareils, navigateurs et sites d'origine. */
export async function AudienceView({ ctx }: { ctx: StatsContext }) {
  const [visits, active, views, pages, devices, browsers, referrers, time] = await Promise.all([
    traffic(ctx.f, ctx.p), activity(ctx), viewsByDay(ctx.f, ctx.p), viewsBy("path", ctx.f, ctx.p, 15), viewsBy("device", ctx.f, ctx.p),
    viewsBy("browser", ctx.f, ctx.p), viewsBy("referrer", ctx.f, ctx.p), timeTotals(ctx.p),
  ]);
  const [timed, titles] = await Promise.all([durations(pages.map((p) => p.label), ctx.p), docTitles(pages.map((p) => p.label))]);
  // Une page de cours se lit par son titre (« (fichier) » pour le fichier joint), le chemin reste dans l'infobulle
  const pageLabel = (path: string) => {
    const title = titles.get(path.slice(3, 39));
    return path.startsWith("/d/") && title ? `${title}${path.endsWith("/fichier") ? " (fichier)" : ""}` : path;
  };
  const avg = (pair: readonly [number, number], views: readonly [number, number]) => [views[0] ? pair[0] / views[0] : null, views[1] ? pair[1] / views[1] : null] as const;
  const avgTime = avg(time.seconds, time.views);
  return (
    <div className="grid gap-8">
      <section aria-label="Audience" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Pages vues" value={fr(visits.views[0])} comparison={cmp(visits.views)} />
        <Kpi label="Visiteurs" value={fr(visits.visitors[0])} comparison={cmp(visits.visitors)} hint="avec accord" />
        <Kpi label="Comptes identifiés" value={fr(visits.members[0])} comparison={cmp(visits.members)} hint="avec accord" />
        <Kpi label="Actifs sur 7 jours" value={fr(active.wau[0])} comparison={cmp(active.wau)} hint="au dernier jour" />
        <Kpi label="Fidélité" value={percent(active.stickiness[0])} comparison={cmp(active.stickiness)} hint="actifs du jour ÷ actifs du mois" />
        <Kpi label="Temps moyen par page" value={formatSeconds(avgTime[0])} comparison={cmp(avgTime)} hint="vues chronométrées avec accord" />
      </section>
      <p className="-mt-4 text-sm text-muted-foreground">
        {fr(visits.views[0])} pages vues, {fr(visits.visitors[0])} visiteurs et {fr(visits.members[0])} comptes identifiés. Seules les personnes qui ont accepté la mesure d’audience sont comptées parmi les visiteurs et les comptes, et leur temps de lecture.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel id="actifs" title="Utilisateurs actifs" lead="Par jour, sur 7 jours glissants ou sur 30 jours glissants.">
          <ActiveChart series={active.series} shift={ctx.p.days} bucket={ctx.bucket} />
        </Panel>
        <Panel id="vues" title="Pages vues" lead={ctx.bucket > 1 ? "Par semaine." : "Par jour."}>
          <TrendChart data={seriesOf(ctx, views)} label="Pages vues" shift={ctx.p.days} bucket={ctx.bucket} kind="bar" />
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel id="pages" title="Pages les plus vues" lead="Avec le temps moyen au premier plan, quand il est mesuré." className="lg:row-span-2">
          <BarList rows={pages.map((p) => {
            const t = timed.get(p.label);
            return { label: pageLabel(p.label), n: p.n, prev: p.prev, href: p.label.startsWith("/d/") ? p.label.slice(0, 39) : undefined, hint: t?.views ? formatSeconds(t.seconds / t.views) : undefined, detail: [p.label, t?.views ? `${fr(t.views)} vues chronométrées` : null].filter(Boolean).join(" · ") };
          })} />
        </Panel>
        <Panel id="appareils" title="Appareils"><BarList rows={devices.map((d) => ({ label: d.label, n: d.n, prev: d.prev }))} /></Panel>
        <Panel id="navigateurs" title="Navigateurs"><BarList rows={browsers.map((d) => ({ label: d.label, n: d.n, prev: d.prev }))} /></Panel>
        <Panel id="origines" title="Sites d’origine" lead="Le site d’où vient la première page d’une visite."><BarList rows={referrers.map((d) => ({ label: d.label, n: d.n, prev: d.prev }))} empty="Aucune visite venue d’un autre site." /></Panel>
      </div>
    </div>
  );
}

/** Rétention et entonnoir : jusqu'où vont les inscrits, et qui revient. */
export async function RetentionView({ ctx }: { ctx: StatsContext }) {
  const shape = cohortShape(ctx.p.days);
  const [rows, steps, signups, events, eventRows, consenting] = await Promise.all([
    cohorts(ctx.f, shape.unit, shape.count, ctx.p.current.to), funnel(ctx.f, ctx.p), signupsByDay(ctx.f, ctx.p),
    eventTotals(ctx.p), eventCohorts(ctx.f, Math.max(8, Math.ceil(ctx.p.days / 7)), ctx.p.current.to), consentedPeople(ctx.f, ctx.p),
  ]);
  const table = retentionTable(rows, ctx.p.current.to, shape.unit);
  const eventDays = retentionTable(eventRows.days, ctx.p.current.to, "week");
  const eventWeeks = weeklyRetention(eventRows.weeks, ctx.p.current.to);
  const stepsOf = (s: typeof steps.current): FunnelStep[] => [
    { id: "signed", label: "Inscription", n: s.signed },
    { id: "confirmed", label: "Adresse confirmée", n: s.confirmed },
    { id: "read", label: "Premier cours lu", n: s.read, medianSeconds: s.delays.read },
    { id: "card", label: "Première fiche", n: s.card, medianSeconds: s.delays.card },
    { id: "review", label: "Première révision", n: s.review, medianSeconds: s.delays.review },
    { id: "published", label: "Premier cours publié", n: s.published, medianSeconds: s.delays.published },
  ];
  const signupSeries = seriesOf(ctx, signups);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel id="entonnoir" title="Entonnoir des inscrits" lead={`Inscrits de la période (${fr(steps.current.signed)}, contre ${fr(steps.previous.signed)} la période précédente) : chaque étape atteinte un jour, même après la période.`}>
        <FunnelChart steps={funnelView(stepsOf(steps.current))} previous={funnelView(stepsOf(steps.previous))} />
      </Panel>
      <Panel id="cohortes" title="Rétention par cohorte" lead={`Inscrits de chaque ${shape.unit === "week" ? "semaine" : "mois"} revenus au moins une fois à J+1, J+7 et J+30 ou après. Un point : trop tôt pour mesurer.`}>
        <RetentionGrid lines={table.lines} average={table.average} unit={shape.unit} />
      </Panel>
      <Panel id="evenements" title="Activité par événement" lead="Totaux par jour pour tout le monde, sans identifiant. Enregistrés par le serveur quand l’action réussit.">
        <BarList rows={events.map((e) => ({ label: e.label, n: e.n, prev: e.prev }))} empty="Aucun événement sur cette période." />
      </Panel>
      <Panel id="cohortes-evenements" title="Rétention mesurée par les événements" lead={`Personnes qui ont accepté la mesure d’audience (${fr(consenting)} actives sur la période), par semaine de leur premier événement : revenues à J+1, J+7, J+30 ou après, puis actives chaque semaine (S1 à S8). Sans accord, rien n’est lié à la personne.`}>
        <div className="grid gap-6">
          <RetentionGrid lines={eventDays.lines} average={eventDays.average} unit="week" first="Personnes" empty="Aucun événement lié à une personne sur ces semaines." />
          {eventWeeks.lines.length > 0 && <RetentionGrid lines={eventWeeks.lines} average={eventWeeks.average} unit="week" scale="weeks" first="Personnes" />}
        </div>
      </Panel>
      <Panel id="inscriptions" title="Inscriptions" lead={ctx.bucket > 1 ? "Par semaine." : "Par jour."} className="lg:col-span-2">
        <TrendChart data={signupSeries} label="Inscriptions" shift={ctx.p.days} bucket={ctx.bucket} kind="bar" height="h-48" />
      </Panel>
    </div>
  );
}
