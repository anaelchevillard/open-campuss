import { and, asc, eq, gte, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { deleteExam } from "@/app/actions/study";
import { examShort } from "@/lib/exam-kind";
import { ConfirmForm } from "@/components/action-form";
import { ExamForm } from "@/components/contribute/exam-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Submit } from "@/components/submit";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { requireModerator } from "@/lib/auth";
import { subjectOptions } from "@/lib/catalog";
import { db, schema } from "@/lib/db";
import { IconCalendar } from "@/lib/icons";

export const metadata: Metadata = { title: "Dates des partiels et CC" };

const { exams, subjects } = schema;

const dayOf = (date: Date) => date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
const hourOf = (date: Date) => date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

export default async function ExamDatesPage() {
  const user = await requireModerator();
  const options = await subjectOptions(user);
  const scope = user.role === "admin" ? undefined : eq(subjects.programId, user.programId ?? -1);
  const upcoming = await db.select({ exam: exams, subject: subjects }).from(exams).innerJoin(subjects, eq(exams.subjectId, subjects.id))
    .where(and(gte(exams.at, sql`now() - interval '1 day'`), scope)).orderBy(asc(exams.at)).limit(60);
  // Regroupées par jour : un délégué saisit souvent une semaine de partiels d'un coup
  const days = [...new Map(upcoming.map((row) => [dayOf(row.exam.at), [] as typeof upcoming])).entries()];
  for (const row of upcoming) days.find(([d]) => d === dayOf(row.exam.at))![1].push(row);
  return (
    <Shell user={user}>
      <PageHeader title="Dates des partiels et CC" shortTitle="Dates" />
      <div className="grid items-start gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section className="rounded-xl bg-card p-4 shadow-xs md:p-6" aria-label="Ajouter une date">
          <h2 className="heading mb-4">Ajouter une date</h2>
          <ExamForm subjects={options.map((o) => ({ id: o.id, level: o.level, semester: o.semester, name: `${o.name}${user.role === "admin" ? ` · ${o.program}` : ""}` }))} />
        </section>
        <section className="grid gap-6" aria-label="À venir">
          {days.length ? days.map(([day, rows]) => (
            <div key={day} className="grid gap-1">
              <h2 className="text-sm font-semibold text-muted-foreground first-letter:uppercase">{day}</h2>
              <ul className="stagger grid gap-1">
                {rows.map(({ exam, subject }) => (
                  <li key={exam.id}>
                    <Item size="sm" className="bg-card shadow-xs">
                      <ItemMedia><span className="flex size-10 items-center justify-center rounded-lg bg-brand-tint text-sm font-semibold text-brand-text tabular-nums">{hourOf(exam.at)}</span></ItemMedia>
                      <ItemContent className="min-w-0">
                        <ItemTitle className="font-semibold">{subject.name}</ItemTitle>
                        <ItemDescription>{[examShort(exam.kind), exam.title !== examShort(exam.kind) ? exam.title : "", exam.place].filter(Boolean).join(" · ")}</ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <ConfirmForm action={deleteExam} confirm="Cette date sera retirée."><input type="hidden" name="id" value={exam.id} /><Submit size="sm" variant="ghost">Retirer</Submit></ConfirmForm>
                      </ItemActions>
                    </Item>
                  </li>
                ))}
              </ul>
            </div>
          )) : <EmptyState icon={IconCalendar} title="Aucune date à venir" />}
        </section>
      </div>
    </Shell>
  );
}
