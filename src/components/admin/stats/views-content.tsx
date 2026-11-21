import { count, desc } from "drizzle-orm";
import Link from "next/link";
import { BarList, TrendChart } from "@/components/admin/stats/charts";
import { cmp, seriesOf, type StatsContext } from "@/components/admin/stats/context";
import { Kpi, Panel, TrendBadge } from "@/components/admin/stats/trend";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { coverageBySemester } from "@/lib/admin-stats";
import { compare, formatSeconds, MISS_THRESHOLD, percent } from "@/lib/audience-calc";
import { contributionByDay, contributionTotals, revisionTotals, reviewsByDay, searchMisses, subjectsActivity, timeTotals, topDocuments } from "@/lib/audience-queries";
import { db, schema } from "@/lib/db";
import { loadMetrics } from "@/lib/metrics-server";
import { KIND_LABELS } from "@/lib/notification-view";

const fr = (n: number) => n.toLocaleString("fr-FR");
const delay = (seconds: number | null) => (seconds === null ? "—" : formatSeconds(seconds));

/** Contenus : cours les plus lus et leurs durées, matières, recherches sans résultat. */
export async function ContentView({ ctx }: { ctx: StatsContext }) {
  const [docs, subjects, misses, time] = await Promise.all([topDocuments(ctx.f, ctx.p), subjectsActivity(ctx.f, ctx.p), searchMisses(ctx.p), timeTotals(ctx.p)]);
  return (
    <div className="grid gap-4">
      <Panel id="cours-lus" title="Cours les plus consultés" lead="Vues de la période, lecteurs (progression enregistrée), avancement moyen et temps moyen de lecture au premier plan (mesuré avec accord seulement).">
        {docs.length ? (
          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <Table className="min-w-[40rem]">
              <TableHeader><TableRow><TableHead>Cours</TableHead><TableHead className="text-right">Vues</TableHead><TableHead className="text-right">Lecteurs</TableHead><TableHead className="text-right">Avancement</TableHead><TableHead className="text-right">Temps moyen</TableHead></TableRow></TableHeader>
              <TableBody>{docs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="max-w-80"><Link href={`/d/${d.id}`} className="block truncate font-semibold underline-offset-2 hover:underline">{d.title}</Link>{d.subject && <span className="block truncate text-xs text-muted-foreground">{d.subject}</span>}</TableCell>
                  <TableCell className="text-right tabular-nums"><span className="inline-flex items-center gap-2"><TrendBadge comparison={compare(d.n, d.prev)} />{fr(d.n)}</span></TableCell>
                  <TableCell className="text-right tabular-nums">{fr(d.readers)}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.completion === null ? "—" : `${d.completion} %`}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatSeconds(d.seconds)}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        ) : <p className="text-sm text-muted-foreground">Aucun cours consulté sur cette période.</p>}
        <p className="text-sm text-muted-foreground">Temps de lecture mesuré sur tout le site : {formatSeconds(time.seconds[0])} en {fr(time.views[0])} vues chronométrées.</p>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel id="matieres" title="Matières" lead="Vues de leurs cours ; le nom filtre toute la page sur la matière, l’infobulle donne lecteurs, fiches révisées et cours publiés.">
          <BarList rows={subjects.map((s) => ({
            label: s.name, n: s.views, prev: s.prev, hint: `L${s.level}`, href: ctx.href({ matiere: s.id }),
            detail: `${fr(s.readers)} lecteurs · ${fr(s.reviews)} fiches révisées · ${fr(s.published)} cours publiés`,
          }))} empty="Aucune matière avec des cours pour ces filtres." />
        </Panel>
        <Panel id="recherche" title="Recherches sans résultat" lead={`${fr(misses.total[0])} sur la période (avec accord à la mesure). Ne sont listées que les recherches faites au moins ${MISS_THRESHOLD} fois ; toutes licences. Un clic relance la recherche.`}
          action={<TrendBadge comparison={cmp(misses.total)} better="down" />}>
          <BarList rows={misses.top.map((m) => ({ label: m.label, n: m.n, prev: m.prev, href: `/matieres?q=${encodeURIComponent(m.label)}` }))} empty="Aucune recherche répétée sans résultat." />
        </Panel>
      </div>
    </div>
  );
}

/** Révision : notes données, réviseurs, réussite, temps, fiches créées, quiz. */
export async function RevisionView({ ctx }: { ctx: StatsContext }) {
  const [t, reviews] = await Promise.all([revisionTotals(ctx.f, ctx.p), reviewsByDay(ctx.f, ctx.p)]);
  const perPerson = [t.reviewers[0] ? t.reviews[0] / t.reviewers[0] : null, t.reviewers[1] ? t.reviews[1] / t.reviewers[1] : null] as const;
  return (
    <div className="grid gap-4">
      <section aria-label="Révision" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Fiches révisées" value={fr(t.reviews[0])} comparison={cmp(t.reviews)} hint="notes données" />
        <Kpi label="Réviseurs" value={fr(t.reviewers[0])} comparison={cmp(t.reviewers)} />
        <Kpi label="Fiches par réviseur" value={perPerson[0] === null ? "—" : fr(Math.round(perPerson[0]))} comparison={cmp(perPerson)} />
        <Kpi label="Réussite" value={percent(t.success[0])} comparison={cmp(t.success)} hint="note autre que « Raté »" />
        <Kpi label="Temps par fiche" value={t.msPerCard[0] === null ? "—" : formatSeconds(t.msPerCard[0] / 1000)} comparison={cmp(t.msPerCard)} better="down" hint="médiane" />
        <Kpi label="Fiches créées" value={fr(t.cardsCreated[0])} comparison={cmp(t.cardsCreated)} />
        <Kpi label="Séances" value={fr(t.studyDays[0])} comparison={cmp(t.studyDays)} hint="jours de révision, par personne" />
        <Kpi label="Temps de révision" value={formatSeconds(t.seconds[0])} comparison={cmp(t.seconds)} hint={ctx.f.subjectId ? "toutes matières" : undefined} />
        <Kpi label="Quiz faits" value={fr(t.quizzes[0])} comparison={cmp(t.quizzes)} />
        <Kpi label="Score moyen aux quiz" value={percent(t.quizScore[0])} comparison={cmp(t.quizScore)} />
      </section>
      <Panel id="revisions" title="Fiches révisées" lead={`${ctx.bucket > 1 ? "Par semaine" : "Par jour"}. Les matières les plus révisées sont dans Contenus.`} action={<Link href={`${ctx.href({ vue: "contenus" })}#matieres`} className="text-sm text-link hover:underline">Par matière</Link>}>
        <TrendChart data={seriesOf(ctx, reviews)} label="Fiches révisées" shift={ctx.p.days} bucket={ctx.bucket} kind="bar" />
      </Panel>
    </div>
  );
}

/** Contribution : envois, décisions, corrections, demandes, et les délais de chacun. */
export async function ContributionView({ ctx }: { ctx: StatsContext }) {
  const [t, sent, published] = await Promise.all([contributionTotals(ctx.f, ctx.p), contributionByDay(ctx.f, ctx.p, ["sent", "resubmitted"]), contributionByDay(ctx.f, ctx.p, ["published"])]);
  return (
    <div className="grid gap-4">
      <section aria-label="Contribution" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Envois en relecture" value={fr(t.sent[0])} comparison={cmp(t.sent)} href="/moderation" hint={t.waiting ? `${fr(t.waiting)} encore sans réponse` : undefined} />
        <Kpi label="Publications" value={fr(t.published[0])} comparison={cmp(t.published)} href="/admin/contenus" />
        <Kpi label="Renvois" value={fr(t.rejected[0])} comparison={cmp(t.rejected)} better="down" />
        <Kpi label="Contributeurs" value={fr(t.authors[0])} comparison={cmp(t.authors)} hint="ont envoyé au moins un cours" />
        <Kpi label="Corrections proposées" value={fr(t.corrections[0])} comparison={cmp(t.corrections)} hint={`${fr(t.correctionsAccepted[0])} acceptées`} />
        <Kpi label="Demandes de cours" value={fr(t.requests[0])} comparison={cmp(t.requests)} href="/admin/moderation?onglet=demandes" />
        <Kpi label="Demandes satisfaites" value={fr(t.requestsAnswered[0])} comparison={cmp(t.requestsAnswered)} />
        <Kpi label="Taux de publication" value={percent(t.sent[0] ? t.published[0] / t.sent[0] : null)} hint="publications ÷ envois" />
      </section>
      <Panel id="delais" title="Délais" lead="Médianes de la période ; une baisse est une bonne nouvelle.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Kpi label="Première réponse à un envoi" value={delay(t.firstResponse[0])} comparison={cmp(t.firstResponse)} better="down" hint={t.firstResponseP90 !== null ? `9 sur 10 en moins de ${formatSeconds(t.firstResponseP90)}` : "publication ou renvoi"} href="/moderation" />
          <Kpi label="De la demande de validation à la publication" value={delay(t.publication[0])} comparison={cmp(t.publication)} better="down" />
          <Kpi label="Réponse à une demande de cours" value={delay(t.requestDelay[0])} comparison={cmp(t.requestDelay)} better="down" hint="jusqu’au cours publié" />
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel id="envois" title="Envois en relecture" lead={ctx.bucket > 1 ? "Par semaine." : "Par jour."}><TrendChart data={seriesOf(ctx, sent)} label="Envois" shift={ctx.p.days} bucket={ctx.bucket} kind="bar" height="h-48" /></Panel>
        <Panel id="publications" title="Publications" lead={ctx.bucket > 1 ? "Par semaine." : "Par jour."}><TrendChart data={seriesOf(ctx, published)} label="Publications" shift={ctx.p.days} bucket={ctx.bucket} kind="bar" height="h-48" /></Panel>
      </div>
    </div>
  );
}

/** Couverture et rappels : indépendants de la période (sauf la licence et l'année pour les semestres). */
export async function CoverageView({ ctx }: { ctx: StatsContext }) {
  const [metrics, semesters, reminders] = await Promise.all([
    loadMetrics(), coverageBySemester(ctx.f.programId),
    // Totaux seuls : personne n'apparaît. Les notifications s'effacent à 90 jours, la fenêtre est donc la même.
    db.select({ kind: schema.notifications.kind, created: count(), sent: count(schema.notifications.pushedAt), opened: count(schema.notifications.clickedAt) })
      .from(schema.notifications).groupBy(schema.notifications.kind).orderBy(desc(count())),
  ]);
  const rows = semesters.filter((c) => !ctx.f.level || c.level === ctx.f.level);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel id="semestres" title="Couverture par semestre" lead="Publications par matière et semestre (CM, TD, fiches, partiels, projets), pour la licence et l’année choisies.">
        <BarList rows={rows.map((c) => ({ label: c.subject, hint: `L${c.level} · ${c.semester ? `S${c.semester}` : "annuelle"} · ${c.label}`, n: c.n }))} empty="Aucune matière pour ces filtres." />
      </Panel>
      <section aria-labelledby="couverture" className="grid content-start gap-3 rounded-xl bg-card p-4 shadow-xs md:p-5">
        <h2 id="couverture" className="font-sans text-base font-semibold">CM par matière</h2>
        {metrics.coverage.programs.length ? (
          <div className="grid gap-6">
            {metrics.coverage.programs.filter((program) => !ctx.f.programId || program.id === ctx.f.programId).map((program) => (
              <div key={program.id}>
                <h3 className="mb-1 font-sans text-sm font-semibold">{program.name}</h3>
                {program.levels.filter((level) => !ctx.f.level || level.level === ctx.f.level).map((level) => (
                  <details key={level.level} open={level.level === (ctx.f.level ?? 1)} className="border-b border-border last:border-b-0">
                    <summary className="flex min-h-11 cursor-pointer items-center gap-3 py-2 text-sm"><span className="font-semibold">L{level.level}</span><span className="ml-auto tabular-nums text-muted-foreground">{level.share.n} sur {level.share.total} {level.share.total > 1 ? "matières couvertes" : "matière couverte"}</span></summary>
                    <ul className="line-list pb-2">
                      {level.subjects.map((subject) => (
                        <li key={subject.id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                          <Link className="min-w-0 underline-offset-2 wrap-break-word hover:underline" href={ctx.href({ vue: "contenus", matiere: subject.id })}>{subject.name}</Link>
                          <span className={`shrink-0 tabular-nums ${subject.courses ? "" : "text-muted-foreground"}`}>{subject.courses ? `${subject.courses} CM` : "Aucun CM"}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">Aucune licence ouverte pour l’instant.</p>}
      </section>
      <section aria-labelledby="rappels" className="grid content-start gap-3 rounded-xl bg-card p-4 shadow-xs md:p-5 lg:col-span-2">
        <div>
          <h2 id="rappels" className="font-sans text-base font-semibold">Ce qui fait revenir</h2>
          <p className="text-sm text-muted-foreground">Sur 90 jours, toutes licences. Envoyé : parti par push ou par mail. Ouvert : un clic, depuis le centre, un push ou un mail.</p>
        </div>
        {reminders.length ? (
          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <Table className="min-w-[32rem]">
              <TableHeader><TableRow><TableHead>Type</TableHead><TableHead className="text-right">Dans le centre</TableHead><TableHead className="text-right">Envoyés</TableHead><TableHead className="text-right">Ouverts</TableHead><TableHead className="text-right">Taux d’ouverture</TableHead></TableRow></TableHeader>
              <TableBody>{reminders.map((r) => <TableRow key={r.kind}><TableCell>{KIND_LABELS[r.kind] ?? r.kind}</TableCell><TableCell className="text-right tabular-nums">{r.created}</TableCell><TableCell className="text-right tabular-nums">{r.sent}</TableCell><TableCell className="text-right tabular-nums">{r.opened}</TableCell><TableCell className="text-right tabular-nums">{percent(r.created ? r.opened / r.created : null)}</TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
        ) : <p className="text-sm text-muted-foreground">Aucune notification pour l’instant.</p>}
      </section>
    </div>
  );
}
