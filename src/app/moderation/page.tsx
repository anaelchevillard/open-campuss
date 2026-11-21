import { and, asc, count, countDistinct, desc, eq, inArray, isNotNull, isNull, type SQL } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AiSurface } from "@/components/ai/ai-surface";
import { CourseBody } from "@/components/course-body";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { DiffView } from "@/components/review/diff-view";
import { AfterQueue, CardQueue, RevisionQueue, ValidateQueue, type CardItem, type DocItem } from "@/components/review/moderation-queues";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { Shell } from "@/components/shell";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { moderatePack } from "@/app/actions/packs";
import { artifactSrc } from "@/lib/rich/artifact-server";
import { aiAvailable } from "@/lib/ai-available";
import { ATTESTATIONS } from "@/lib/attestations";
import { requireModerator } from "@/lib/auth";
import { missingBySubject } from "@/lib/coverage";
import { db, schema } from "@/lib/db";
import { CATEGORY_PLURALS, CATEGORY_TAGS, RIGHTS_SHORT } from "@/lib/db/categories";
import { IconExternal, IconFlag, IconPublished, IconWarning } from "@/lib/icons";
import { blockDiff, diffCounts } from "@/lib/line-diff";
import { isOverdue, waitingFor } from "@/lib/review-wait";
import { currentParity } from "@/lib/semester";

export const metadata: Metadata = { title: "À valider" };

const { documents, memoCardReports, memoPackReports, memoPacks, revisions, subjects, users, programs } = schema;

const TABS = [
  { value: "valider", label: "À valider" },
  { value: "apres", label: "Après coup" },
  { value: "corrections", label: "Corrections" },
  { value: "fiches", label: "Fiches IA" },
  { value: "paquets", label: "Paquets" },
  { value: "manques", label: "Manques" },
] as const;
type Tab = (typeof TABS)[number]["value"];

const LIMIT = 60;

/** En-tête de l'aperçu : ce que verront les étudiants, avec les faits utiles à la décision. */
function PreviewHead({ title, facts, warning, children }: { title: string; facts: string[]; warning?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 grid gap-2">
      <h2 className="title text-balance">{title.trim() || "Sans titre"}</h2>
      <p className="text-sm text-muted-foreground">{facts.filter(Boolean).join(" · ")}</p>
      {warning}
      {children}
    </header>
  );
}

const unknownOrigin = <p className="flex items-center gap-1.5 text-sm font-semibold text-warning-foreground"><Icon icon={IconWarning} size={16} />Origine non déclarée : à préciser avant publication</p>;

export default async function ModerationPage({ searchParams }: PageProps<"/moderation">) {
  const user = await requireModerator();
  const raw = (await searchParams).onglet;
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : "valider";
  const scope = user.role === "admin" ? undefined : eq(documents.programId, user.programId ?? -1);
  const shortcuts = user.prefs?.shortcuts !== false;
  const now = new Date();

  const [[toReview], [afterwards], [pendingRevisions], [cardReports]] = await Promise.all([
    db.select({ n: count() }).from(documents).where(and(eq(documents.reviewRequested, true), eq(documents.published, false), isNull(documents.deletedAt), scope)),
    db.select({ n: count() }).from(documents).where(and(eq(documents.published, true), isNull(documents.deletedAt), isNotNull(documents.postReviewAt), scope)),
    db.select({ n: count() }).from(revisions).innerJoin(documents, eq(revisions.documentId, documents.id)).where(and(eq(revisions.status, "pending"), isNull(documents.deletedAt), scope)),
    db.select({ n: count() }).from(memoCardReports).innerJoin(documents, eq(memoCardReports.documentId, documents.id)).where(and(eq(memoCardReports.status, "open"), isNull(documents.deletedAt), scope)),
  ]);
  const packScope = user.role === "admin" ? undefined : eq(memoPacks.programId, user.programId ?? -1);
  const [packReports] = await db.select({ n: countDistinct(memoPackReports.packId) }).from(memoPackReports).innerJoin(memoPacks, eq(memoPackReports.packId, memoPacks.id)).where(and(eq(memoPackReports.status, "open"), packScope));
  const counts: Partial<Record<Tab, number>> = { valider: toReview.n, apres: afterwards.n, corrections: pendingRevisions.n, fiches: cardReports.n, paquets: packReports.n };

  let body: ReactNode;
  if (tab === "valider" || tab === "apres") {
    const rows = await db.select({ doc: documents, author: users.name, authorId: users.id, subject: subjects.name }).from(documents)
      .leftJoin(users, eq(documents.createdBy, users.id)).leftJoin(subjects, eq(documents.subjectId, subjects.id))
      .where(tab === "valider"
        ? and(eq(documents.reviewRequested, true), eq(documents.published, false), isNull(documents.deletedAt), scope)
        : and(eq(documents.published, true), isNull(documents.deletedAt), isNotNull(documents.postReviewAt), scope))
      .orderBy(tab === "valider" ? asc(documents.reviewRequestedAt) : asc(documents.postReviewAt)).limit(LIMIT);
    // Combien de cours chaque auteur a déjà fait valider : un premier cours mérite plus d'attention
    const authorIds = [...new Set(rows.map((r) => r.authorId).filter((id): id is string => Boolean(id)))];
    const validated = authorIds.length ? await db.select({ id: documents.createdBy, n: count() }).from(documents)
      .where(and(inArray(documents.createdBy, authorIds), eq(documents.published, true), isNull(documents.deletedAt), eq(documents.hiddenByReports, false), isNull(documents.postReviewAt))).groupBy(documents.createdBy) : [];
    const validatedOf = (id: string | null) => validated.find((v) => v.id === id)?.n ?? 0;
    const items: DocItem[] = rows.map(({ doc, author, authorId, subject }) => {
      const since = tab === "valider" ? doc.reviewRequestedAt ?? doc.updatedAt : doc.postReviewAt ?? doc.updatedAt;
      return {
        id: doc.id, title: doc.title, meta: [CATEGORY_TAGS[doc.category], subject, author ?? "Ancien compte"].filter(Boolean).join(" · "),
        wait: { label: waitingFor(since, now), late: tab === "valider" && isOverdue(since, now) },
        flag: tab === "valider" && doc.rightsBasis === "unknown" ? "Origine ?" : undefined,
        blockedReason: tab === "valider" && doc.rightsBasis === "unknown" ? 1 : undefined,
        authorId, authorName: author ?? "Ancien compte",
      };
    });
    const previews = Object.fromEntries(rows.map(({ doc, author, authorId, subject }) => {
      const firstTime = tab === "valider" && authorId && validatedOf(authorId) === 0;
      return [doc.id, (
        <article key={doc.id}>
          <PreviewHead title={doc.title} facts={[CATEGORY_TAGS[doc.category], subject ?? "", doc.chapter ? `chap. ${doc.chapter}` : "", author ?? "Ancien compte", RIGHTS_SHORT[doc.rightsBasis] ?? ""]}
            warning={doc.rightsBasis === "unknown" ? unknownOrigin : firstTime ? <p className="text-sm text-info-foreground">Premier cours de cet auteur</p> : undefined}>
            {doc.description && <p className="text-pretty text-muted-foreground">{doc.description}</p>}
          </PreviewHead>
          {doc.kind === "editor"
            ? <CourseBody markdown={doc.bodyMarkdown ?? ""} rich={{ artifactSrc: artifactSrc(doc.id, user.id) }} />
            : <Link href={`/d/${doc.id}`} className="inline-flex items-center gap-1.5 font-semibold text-link hover:underline">Ouvrir le document<Icon icon={IconExternal} size={16} /></Link>}
        </article>
      )];
    }));
    body = tab === "valider"
      ? <ValidateQueue items={items} previews={previews} shortcuts={shortcuts} attestText={ATTESTATIONS.publish} />
      : <AfterQueue items={items} previews={previews} shortcuts={shortcuts} />;
  } else if (tab === "corrections") {
    const rows = await db.select({ revision: revisions, doc: documents, author: users.name }).from(revisions)
      .innerJoin(documents, eq(revisions.documentId, documents.id)).leftJoin(users, eq(revisions.authorId, users.id))
      .where(and(eq(revisions.status, "pending"), isNull(documents.deletedAt), scope)).orderBy(asc(revisions.createdAt)).limit(30);
    const items = rows.map(({ revision, doc, author }) => {
      const blocks = blockDiff(doc.bodyMarkdown ?? "", revision.bodyMarkdown);
      const { added, removed } = diffCounts(blocks);
      return { revision, doc, author, blocks, item: { id: revision.id, documentId: doc.id, title: doc.title, meta: [author ?? "Ancien compte", `+${added} −${removed} mots`].join(" · "), wait: { label: waitingFor(revision.createdAt, now) } } };
    });
    const previews = Object.fromEntries(items.map(({ revision, doc, author, blocks }) => [revision.id, (
      <article key={revision.id}>
        <PreviewHead title={doc.title} facts={[`Correction de ${author ?? "Ancien compte"}`, revision.summary]} />
        <DiffView blocks={blocks} />
      </article>
    )]));
    body = <RevisionQueue items={items.map((i) => i.item)} previews={previews} shortcuts={shortcuts} />;
  } else if (tab === "fiches") {
    const rows = await db.select({ report: memoCardReports, title: documents.title }).from(memoCardReports)
      .innerJoin(documents, eq(memoCardReports.documentId, documents.id)).where(and(eq(memoCardReports.status, "open"), isNull(documents.deletedAt), scope))
      .orderBy(desc(memoCardReports.reports), asc(memoCardReports.createdAt)).limit(LIMIT);
    const items: CardItem[] = rows.map(({ report, title }) => ({
      id: `${report.documentId}:${report.cardKey}`, documentId: report.documentId, cardKey: report.cardKey, title: report.front,
      meta: title, flag: `${report.reports} signalement${report.reports > 1 ? "s" : ""}`,
    }));
    const previews = Object.fromEntries(rows.map(({ report, title }) => [`${report.documentId}:${report.cardKey}`, (
      <article key={report.cardKey} className="grid gap-4">
        <PreviewHead title="Fiche signalée" facts={[title, `${report.reports} signalement${report.reports > 1 ? "s" : ""}`]} />
        <AiSurface notice={false}><p className="text-xs font-semibold text-muted-foreground">Recto</p><p data-reading className="mt-1 text-pretty">{report.front}</p></AiSurface>
        <AiSurface><p className="text-xs font-semibold text-muted-foreground">Verso</p><p data-reading className="mt-1 text-pretty">{report.back}</p></AiSurface>
      </article>
    )]));
    body = <CardQueue items={items} previews={previews} shortcuts={shortcuts} ai={await aiAvailable()} />;
  } else if (tab === "paquets") {
    body = <PackReports scope={packScope} />;
  } else {
    body = <Missing user={user} />;
  }

  return (
    <Shell user={user} width="wide">
      <PageHeader title="À valider" className="mb-6"
        tabs={<SegmentedTabs label="Files" value={tab} items={TABS.map((t) => ({ value: t.value, label: t.label, count: counts[t.value], href: t.value === "valider" ? "/moderation" : `/moderation?onglet=${t.value}` }))} />} />
      {body}
    </Shell>
  );
}

/** Manques : par année, les matières du semestre en cours où il manque un cours, une fiche ou un partiel. */
async function Missing({ user }: { user: { role: string; programId: number | null } }) {
  const scopePrograms = user.role === "admin"
    ? await db.select({ id: programs.id, name: programs.name }).from(programs).where(eq(programs.active, true)).orderBy(asc(programs.position))
    : user.programId ? await db.select({ id: programs.id, name: programs.name }).from(programs).where(eq(programs.id, user.programId)) : [];
  const groups = (await Promise.all(scopePrograms.flatMap((program) => [1, 2, 3].map(async (level) => {
    const parity = await currentParity({ programId: program.id, level });
    const rows = await missingBySubject(program.id, level, parity);
    return { key: `${program.id}-${level}`, label: `${scopePrograms.length > 1 ? `${program.name} · ` : ""}L${level} · S${2 * level - 2 + parity}`, rows };
  })))).filter((g) => g.rows.some((r) => r.missing.length));
  if (!groups.length) return <EmptyState icon={IconPublished} title="Rien ne manque ce semestre" />;
  return (
    <div className="grid max-w-3xl gap-8">
      {groups.map((group) => (
        <section key={group.key} className="grid gap-2">
          <h2 className="heading">{group.label}</h2>
          <ul className="stagger grid gap-1">
            {group.rows.map(({ subject, missing }) => (
              <li key={subject.id} className={missing.length ? undefined : "opacity-60"}>
                <Link href={`/matieres/${subject.id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg px-3 py-2 transition-colors hover:bg-muted">
                  <span className="font-semibold">{subject.name}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {missing.length
                      ? missing.map((c) => <Badge key={c} variant="warning-light" size="lg" radius="full" className="gap-1"><Icon icon={IconFlag} size={16} className="size-3.5" />{CATEGORY_PLURALS[c]}</Badge>)
                      : <span className="text-sm text-muted-foreground">Complet</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Paquets publics signalés : un paquet par ligne, avec les motifs ; retrait ou maintien comme pour un document. */
async function PackReports({ scope }: { scope: SQL | undefined }) {
  const rows = await db.select({ pack: memoPacks, reason: memoPackReports.reason }).from(memoPackReports).innerJoin(memoPacks, eq(memoPackReports.packId, memoPacks.id))
    .where(and(eq(memoPackReports.status, "open"), scope)).orderBy(asc(memoPackReports.createdAt)).limit(LIMIT * 3);
  const packs = new Map<string, { pack: typeof memoPacks.$inferSelect; reasons: string[] }>();
  for (const row of rows) {
    const entry = packs.get(row.pack.id) ?? { pack: row.pack, reasons: [] };
    if (row.reason) entry.reasons.push(row.reason);
    packs.set(row.pack.id, entry);
  }
  if (!packs.size) return <EmptyState icon={IconPublished} title="Aucun paquet signalé" />;
  return (
    <ul className="grid gap-3">
      {[...packs.values()].map(({ pack, reasons }) => (
        <li key={pack.id} className="grid gap-3 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Link href={`/reviser/fiches/paquets/${pack.id}`} className="font-semibold underline-offset-2 hover:underline">{pack.title}</Link>
            <span className="text-sm text-muted-foreground">{pack.removedAt ? "Déjà retiré" : `${pack.copies} copie${pack.copies > 1 ? "s" : ""}`}</span>
          </div>
          {reasons.length > 0 && <ul className="grid gap-1 text-sm text-muted-foreground">{reasons.map((r, i) => <li key={i}>« {r} »</li>)}</ul>}
          <form action={moderatePack} className="flex flex-wrap gap-2">
            <input type="hidden" name="id" value={pack.id} />
            <Button type="submit" name="decision" value="remove" variant="destructive" size="sm">Retirer le paquet</Button>
            <Button type="submit" name="decision" value="keep" variant="outline" size="sm">Garder</Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
