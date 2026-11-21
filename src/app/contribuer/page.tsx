import { and, asc, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthorStatsRow, ToFixAlerts } from "@/components/contribute/author-header";
import { MyDocuments, type Option } from "@/components/contribute/my-documents";
import { NewButton } from "@/components/contribute/new-button";
import { StartPanel } from "@/components/contribute/start-panel";
import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { aiAvailable } from "@/lib/ai-available";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { yearLabel } from "@/lib/doc-facets";
import { loadMyDocuments } from "@/lib/my-documents-server";
import { featureOn } from "@/lib/site-settings";
import { authorStats } from "@/lib/site-stats";
import { canWithdrawDirectly } from "@/lib/withdrawal-rules";

export const metadata: Metadata = { title: "Mes documents" };

// Les filtres, l'onglet et la vue sont lus côté client (MyDocuments) : la page ne dépend pas de l'adresse
export default async function ContributePage() {
  const user = await requireUser();
  const [docs, stats] = await Promise.all([loadMyDocuments(user), authorStats(user.id)]);

  if (!docs.length) {
    const [[blank], ai, files] = await Promise.all([
      db.select({ id: schema.documents.id }).from(schema.documents).where(and(eq(schema.documents.createdBy, user.id), eq(schema.documents.kind, "editor"), eq(schema.documents.title, ""), eq(schema.documents.bodyMarkdown, ""))).limit(1),
      aiAvailable(), featureOn("imports"),
    ]);
    return (
      <Shell user={user}>
        <PageHeader title="Mes documents" action={<NewButton />} />
        <StartPanel blankDraftId={blank?.id ?? null} ai={ai} files={files} />
      </Shell>
    );
  }

  const subjectIds = [...new Set(docs.map((d) => d.subjectId).filter((id): id is number => id !== null))];
  const subjectRows = subjectIds.length ? await db.select({ id: schema.subjects.id, name: schema.subjects.name }).from(schema.subjects).where(inArray(schema.subjects.id, subjectIds)).orderBy(asc(schema.subjects.name)) : [];
  const subjects: Option[] = subjectRows.map((s) => ({ value: String(s.id), label: s.name }));
  const years: Option[] = [...new Set(docs.map((d) => d.academicYear).filter(Boolean))].sort().reverse().map((y) => ({ value: y, label: yearLabel(y) }));
  const hasPublished = docs.some((d) => d.published || d.status === "published");

  return (
    <Shell user={user} width="wide">
      <PageHeader title="Mes documents" action={<NewButton />} className="mb-6" />
      <div className="grid gap-8">
        <ToFixAlerts docs={docs} />
        {hasPublished && <AuthorStatsRow stats={stats} />}
        <Suspense>
          <MyDocuments docs={docs} subjects={subjects} years={years} viewerId={user.id} withdrawDirectly={canWithdrawDirectly(user, { published: true })} />
        </Suspense>
      </div>
    </Shell>
  );
}
