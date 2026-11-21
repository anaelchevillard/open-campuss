import { and, asc, eq, gte, inArray, or, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { examInSentence, examShort } from "@/lib/exam-kind";
import { EmptyState } from "@/components/empty-state";
import { CountUp } from "@/components/fx";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { ExamDateForm } from "@/components/revise/exam-date-form";
import { GoalRing } from "@/components/revise/game-widgets";
import { ExamPaperList } from "@/components/revise/resources";
import { ReviseTabs, Section } from "@/components/revise/revise-parts";
import { Timeline, TimelineContent, TimelineHeader, TimelineIndicator, TimelineItem, TimelineSeparator, TimelineTitle } from "@/components/reui/timeline";
import { Shell } from "@/components/shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { readableDocuments } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { cardCounts } from "@/lib/card-counts";
import { db, schema } from "@/lib/db";
import { formatDateTime } from "@/lib/documents";
import { myMeetings } from "@/lib/groups";
import { readinessBySubject } from "@/lib/habits";
import { IconCalendar, IconNotifications, IconNotificationsOff, IconTogether } from "@/lib/icons";
import { READINESS_FORMULA } from "@/lib/readiness";
import { featureOn } from "@/lib/site-settings";
import { toggleExamSeries } from "@/app/actions/study";
import { revisionPlan } from "@/lib/fsrs";
import { examPapersForMe } from "@/lib/revise-resources";
import { inSentence } from "@/lib/subject-name";

export const metadata: Metadata = { title: "Partiels" };

const { exams, subjects, documents, revised } = schema;
const daysUntil = (date: Date) => Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
const dayLabel = (offset: number) => offset === 0 ? "Aujourd’hui" : offset === 1 ? "Demain" : new Date(Date.now() + offset * 86_400_000).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short", timeZone: "Europe/Paris" });

export default async function ExamsPage() {
  const user = await requireUser();
  const moderator = user.role === "admin" || user.role === "delegate";
  const scope = user.role === "admin" ? undefined : eq(subjects.programId, user.programId ?? -1);
  const upcoming = await db.select({ exam: exams, subject: subjects }).from(exams).innerJoin(subjects, eq(exams.subjectId, subjects.id))
    .where(and(gte(exams.at, sql`now() - interval '1 day'`), scope, user.level && !moderator ? or(eq(subjects.level, user.level)) : undefined)).orderBy(asc(exams.at)).limit(40);
  const subjectIds = [...new Set(upcoming.map((u) => u.subject.id))];
  const docs = subjectIds.length ? await db.select({ id: documents.id, title: documents.title, subjectId: documents.subjectId }).from(documents).where(and(readableDocuments(user), inArray(documents.subjectId, subjectIds))) : [];
  const done = new Set((await db.select({ id: revised.documentId }).from(revised).where(eq(revised.userId, user.id))).map((r) => r.id));
  const muted = new Set((await db.select({ id: schema.examSeriesMutes.examId }).from(schema.examSeriesMutes).where(eq(schema.examSeriesMutes.userId, user.id))).map((r) => r.id));
  const next = upcoming[0];
  const plan = next ? revisionPlan(docs.filter((d) => d.subjectId === next.subject.id && !done.has(d.id)), daysUntil(next.exam.at)) : [];
  const [scores, meetings, ranking, mySubjects, cards, papers] = await Promise.all([
    readinessBySubject(user, subjectIds), myMeetings(user.id), featureOn("ranking"),
    moderator && user.programId ? db.select({ id: subjects.id, name: subjects.shortName }).from(subjects).where(and(eq(subjects.programId, user.programId), user.level ? eq(subjects.level, user.level) : undefined)).orderBy(asc(subjects.position)) : Promise.resolve([]),
    cardCounts(user.id),
    examPapersForMe(user),
  ]);
  const ready = next ? scores.get(next.subject.id) : undefined;
  const days = next ? daysUntil(next.exam.at) : 0;
  return (
    <Shell user={user}>
      <PageHeader title="Réviser" shortTitle="Partiels" tabs={<ReviseTabs value="exams" ranking={ranking} due={cards.due} />} action={moderator && mySubjects.length ? <ExamDateForm subjects={mySubjects} /> : undefined} />
      {!next && <EmptyState icon={IconCalendar} title="Aucun partiel ni CC annoncé pour l’instant" description={moderator ? undefined : "Les délégués les ajoutent dès qu’elles sont connues"} />}
      {!next && meetings.length > 0 && <div className="mt-12 max-w-xl"><Meetings meetings={meetings} /></div>}
      {next && (
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="grid content-start gap-12">
            <section aria-label={next.exam.kind === "cc" ? "Prochain CC" : "Prochain partiel"} className="rise grid gap-6 rounded-2xl bg-card p-5 shadow-sm md:p-8">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div className="grid gap-1">
                  <p className="text-sm text-muted-foreground">{[examShort(next.exam.kind), next.exam.title !== examShort(next.exam.kind) ? next.exam.title : ""].filter(Boolean).join(" · ")} · {formatDateTime(next.exam.at)}{next.exam.place ? ` · ${next.exam.place}` : ""}</p>
                  <h2 className="title">{next.subject.name}</h2>
                  <p className="mt-2 flex items-baseline gap-2"><span className="text-6xl leading-none font-semibold text-brand-text tabular-nums md:text-7xl"><CountUp value={days} /></span><span className="text-lg text-muted-foreground">{days > 1 ? "jours" : days === 1 ? "jour" : "c’est aujourd’hui"}</span></p>
                </div>
                {ready?.known && (
                  <GoalRing value={ready.percent} goal={100} size={112} stroke={10} label={`Prêt à ${ready.percent} %`}>
                    <span className="grid leading-tight"><span className="text-2xl font-semibold tabular-nums">{ready.percent} %</span><span className="text-xs text-muted-foreground">prêt</span></span>
                  </GoalRing>
                )}
              </div>
              {ready && <p className="text-sm text-muted-foreground">{ready.detail || READINESS_FORMULA}</p>}
              <div className="flex flex-wrap gap-2">
                <Link href={`/reviser/seance?mode=partiel&matiere=${next.subject.id}`} data-slot="button" className={buttonVariants({ size: "lg" })}>Partiel blanc</Link>
                <Link href={`/reviser/seance?matiere=${next.subject.id}`} data-slot="button" className={buttonVariants({ variant: "ghost", size: "lg" })}>Réviser {inSentence(next.subject.shortName || next.subject.name)}</Link>
              </div>
            </section>
            <Section title={<>Plan de révision : {inSentence(next.subject.shortName || next.subject.name)}</>} label="Plan de révision">
              {plan.length ? (
                <Timeline defaultValue={1} className="mt-1">
                  {plan.map((step, index) => (
                    <TimelineItem key={step.day} step={index + 1}>
                      <TimelineHeader><TimelineSeparator /><TimelineTitle className="first-letter:uppercase">{dayLabel(step.day)}</TimelineTitle><TimelineIndicator /></TimelineHeader>
                      <TimelineContent><ul className="grid gap-0.5">{step.items.map((d) => <li key={d.id}><Link className="text-foreground underline-offset-2 hover:underline" href={`/d/${d.id}`}>{d.title || "Sans titre"}</Link></li>)}</ul></TimelineContent>
                    </TimelineItem>
                  ))}
                </Timeline>
              ) : <p className="text-sm text-muted-foreground">Tout est révisé dans cette matière</p>}
              <p className="text-xs text-muted-foreground">Un cours marqué « Révisé » sort du plan ; la veille reste libre</p>
            </Section>
          </div>
          <aside className="grid content-start gap-10">
            <Section title="À venir" action={<span className="text-xs text-muted-foreground">Rappels : 1 par mois, puis plus souvent</span>}>
              <ol className="stagger grid gap-1">
                {upcoming.map(({ exam, subject }) => {
                  const r = scores.get(subject.id);
                  return (
                    <li key={exam.id} className="flex items-center gap-1">
                      <Link href={`/reviser/seance?matiere=${subject.id}`} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover-ok:bg-muted">
                        <span className="w-12 shrink-0 text-center font-semibold tabular-nums text-brand-text">J-{daysUntil(exam.at)}</span>
                        <span className="grid min-w-0 flex-1"><span className="truncate font-semibold">{subject.shortName || subject.name}</span><span className="truncate text-sm text-muted-foreground">{examShort(exam.kind)} · {formatDateTime(exam.at)}</span></span>
                        {r?.known && <span className="text-sm tabular-nums text-muted-foreground">{r.percent} %</span>}
                      </Link>
                      <form action={toggleExamSeries}>
                        <input type="hidden" name="id" value={exam.id} />
                        <input type="hidden" name="mute" value={muted.has(exam.id) ? "0" : "1"} />
                        <Button type="submit" variant="ghost" size="icon" aria-pressed={!muted.has(exam.id)}
                          aria-label={`${muted.has(exam.id) ? "Relancer" : "Couper"} les rappels ${examInSentence(exam.kind, subject.shortName || subject.name).replace(/^le /, "du ")}`}
                          title={muted.has(exam.id) ? "Rappels coupés : relancer la série" : "Série de rappels active : couper"}>
                          <Icon icon={muted.has(exam.id) ? IconNotificationsOff : IconNotifications} className={muted.has(exam.id) ? "text-muted-foreground" : "text-brand-text"} />
                        </Button>
                      </form>
                    </li>
                  );
                })}
              </ol>
            </Section>
            {meetings.length > 0 && <Meetings meetings={meetings} />}
          </aside>
        </div>
      )}
      {/* Les sujets publiés sont une ressource pour s'entraîner, pas des cours */}
      <section id="sujets" aria-labelledby="sujets-titre" className="mt-12 grid scroll-mt-24 gap-3 pb-28 md:pb-8">
        <h2 id="sujets-titre" className="heading">Sujets de partiels pour s’entraîner</h2>
        {papers.length
          ? <ExamPaperList papers={papers} />
          : <p className="text-sm text-muted-foreground">Aucun sujet de partiel publié dans ta licence pour l’instant. Un sujet partagé avec l’accord de son auteur apparaît ici une fois relu.</p>}
      </section>
    </Shell>
  );
}

function Meetings({ meetings }: { meetings: Awaited<ReturnType<typeof myMeetings>> }) {
  return (
    <Section title="Rendez-vous de groupe">
      <ul className="grid gap-1">{meetings.map((meeting) => <li key={meeting.id}><Link href={`/groupes/${meeting.groupId}`} className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover-ok:bg-muted"><Icon icon={IconTogether} className="text-muted-foreground" /><span className="grid min-w-0 flex-1"><span className="truncate font-semibold">{meeting.group}</span><span className="text-sm text-muted-foreground">{formatDateTime(meeting.at)}{meeting.subject ? ` · ${meeting.subject}` : ""}</span></span></Link></li>)}</ul>
    </Section>
  );
}
