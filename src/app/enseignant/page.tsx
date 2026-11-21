import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { teacherDecision } from "@/app/actions/moderation";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Submit } from "@/components/submit";
import { buttonVariants } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { CATEGORY_TAGS, RIGHTS_SHORT } from "@/lib/db/categories";
import { formatDate } from "@/lib/documents";
import { IconAdd, IconError, IconSubjects, IconSuccess } from "@/lib/icons";

export const metadata: Metadata = { title: "Mes matières" };

const { documents, subjects, subjectTeachers, users } = schema;

export default async function TeacherPage() {
  const user = await requireUser();
  if (user.role !== "teacher") notFound();
  const mine = await db.select({ id: subjects.id, name: subjects.name, level: subjects.level }).from(subjectTeachers).innerJoin(subjects, eq(subjectTeachers.subjectId, subjects.id)).where(eq(subjectTeachers.userId, user.id)).orderBy(asc(subjects.name));
  const docs = mine.length ? await db.select({ doc: documents, author: users.name }).from(documents).leftJoin(users, eq(documents.createdBy, users.id)).where(and(inArray(documents.subjectId, mine.map((s) => s.id)), isNull(documents.deletedAt))).orderBy(desc(documents.updatedAt)) : [];
  return (
    <Shell user={user}>
      <PageHeader title="Mes matières" lead="Tes cours et ce que les étudiants déposent dans tes matières. Retirer ton accord masque le document aussitôt." />
      {!mine.length && <EmptyState icon={IconSubjects} title="Aucune matière ne t’est encore rattachée" description="L’équipe de Campuss relie tes matières à ton compte : écris-lui depuis la page Nous écrire." />}
      <div className="grid max-w-4xl gap-10">
        {mine.map((subject) => {
          const rows = docs.filter(({ doc }) => doc.subjectId === subject.id);
          return (
            <section key={subject.id} className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="heading">{subject.name}<span className="ml-2 font-sans text-sm font-normal text-muted-foreground">L{subject.level}</span></h2>
                <Link href={`/contribuer/nouveau?matiere=${subject.id}`} data-slot="button" className={buttonVariants({ size: "sm" })}><Icon icon={IconAdd} size={16} />Écrire un cours</Link>
              </div>
              {rows.length ? (
                <ul className="stagger grid gap-1">
                  {rows.map(({ doc, author }) => (
                    <li key={doc.id}>
                      <Item className="bg-card shadow-xs">
                        <ItemContent className="min-w-52">
                          <ItemTitle className="font-semibold"><Link className="hover:underline" href={doc.createdBy === user.id && !doc.published ? `/editer/${doc.id}` : `/d/${doc.id}`}>{doc.title.trim() || "Sans titre"}</Link></ItemTitle>
                          <ItemDescription>{[CATEGORY_TAGS[doc.category], doc.createdBy === user.id ? (doc.published ? "Ton cours, publié" : "Ton brouillon") : author, RIGHTS_SHORT[doc.rightsBasis], formatDate(doc.updatedAt)].filter(Boolean).join(" · ")}</ItemDescription>
                          {doc.teacherDecision && (
                            <span className={`flex items-center gap-1.5 text-sm font-semibold ${doc.teacherDecision === "authorized" ? "text-success-foreground" : "text-destructive"}`}>
                              <Icon icon={doc.teacherDecision === "authorized" ? IconSuccess : IconError} size={16} />{doc.teacherDecision === "authorized" ? "Tu as donné ton accord" : "Tu as demandé le retrait"}
                            </span>
                          )}
                        </ItemContent>
                        {doc.createdBy !== user.id && <ItemActions>
                          <form action={teacherDecision} className="flex flex-wrap gap-2">
                            <input type="hidden" name="id" value={doc.id} />
                            {doc.teacherDecision !== "authorized" && <Submit size="sm" variant="outline" name="decision" value="authorized">Donner mon accord</Submit>}
                            {doc.teacherDecision !== "refused" && <Submit size="sm" variant="ghost" name="decision" value="refused">Retirer</Submit>}
                          </form>
                        </ItemActions>}
                      </Item>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">0 document</p>}
            </section>
          );
        })}
      </div>
    </Shell>
  );
}
