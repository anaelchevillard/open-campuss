import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/admin-header";
import { ModerationView } from "@/components/admin/moderation-view";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { Shell } from "@/components/shell";
import { requireAdmin } from "@/lib/auth";
import { db, schema } from "@/lib/db";

export const metadata: Metadata = { title: "Modération" };

const TABS = [["signalements", "Signalements"], ["retraits", "Retraits"], ["profils", "Profils"], ["questions", "Questions masquées"], ["fiches", "Fiches"], ["demandes", "Demandes"]] as const;
type Tab = (typeof TABS)[number][0];
const KINDS = { rights: "Droit d’auteur", error: "Erreur", privacy: "Données personnelles", other: "Autre" } as const;
const FIELDS = { name: "Nom", bio: "Bio", status: "Statut", avatar: "Avatar", banner: "Bannière" } as const;

export default async function ModerationPage({ searchParams }: PageProps<"/admin/moderation">) {
  const admin = await requireAdmin();
  const raw = (await searchParams).onglet;
  const tab: Tab = TABS.some(([t]) => t === raw) ? raw as Tab : "signalements";
  const { reports, documents, profileReports, users, qaPosts, memoCardReports, courseRequests, subjects, courseRequestVotes, withdrawalRequests } = schema;
  const [[r], [p], [q], [f], [d], [w]] = await Promise.all([
    db.select({ n: count() }).from(reports).where(eq(reports.status, "open")),
    db.select({ n: count() }).from(profileReports).where(eq(profileReports.status, "open")),
    db.select({ n: count() }).from(qaPosts).where(eq(qaPosts.hidden, true)),
    db.select({ n: count() }).from(memoCardReports).where(eq(memoCardReports.status, "open")),
    db.select({ n: count() }).from(courseRequests).where(and(isNull(courseRequests.answeredAt), isNull(courseRequests.mergedInto))),
    db.select({ n: count() }).from(withdrawalRequests).where(eq(withdrawalRequests.status, "pending")),
  ]);
  const counts: Record<Tab, number> = { signalements: r.n, retraits: w.n, profils: p.n, questions: q.n, fiches: f.n, demandes: d.n };
  let items: unknown[] = [];
  let subjectList: { id: number; name: string }[] = [];
  if (tab === "signalements") {
    items = (await db.select({ report: reports, doc: documents }).from(reports).leftJoin(documents, eq(reports.documentId, documents.id)).where(eq(reports.status, "open")).orderBy(asc(reports.createdAt)).limit(100))
      .map(({ report, doc }) => ({ id: report.id, title: doc?.title ?? KINDS[report.kind], meta: KINDS[report.kind], kind: KINDS[report.kind], message: report.message, from: report.name || report.email || "Anonyme", docId: doc?.id ?? null, published: doc?.published ?? false, hidden: doc?.hiddenByReports ?? false, at: report.createdAt.toISOString() }));
  } else if (tab === "retraits") {
    // Demandes de retrait d'un cours publié, faites par son auteur étudiant
    items = (await db.select({ request: withdrawalRequests, doc: documents, author: users.name, subject: subjects.name }).from(withdrawalRequests)
      .innerJoin(documents, eq(withdrawalRequests.documentId, documents.id)).leftJoin(users, eq(withdrawalRequests.requesterId, users.id)).leftJoin(subjects, eq(documents.subjectId, subjects.id))
      .where(eq(withdrawalRequests.status, "pending")).orderBy(asc(withdrawalRequests.createdAt)).limit(100))
      .map(({ request, doc, author, subject }) => ({ id: request.id, title: doc.title || "Sans titre", meta: [subject, author ?? "Ancien compte"].filter(Boolean).join(" · "), reason: request.reason, from: author ?? "Ancien compte", docId: doc.id, published: doc.published, at: request.createdAt.toISOString() }));
  } else if (tab === "profils") {
    items = (await db.select({ report: profileReports, target: users }).from(profileReports).innerJoin(users, eq(profileReports.targetId, users.id)).where(eq(profileReports.status, "open")).orderBy(asc(profileReports.createdAt)).limit(100))
      .map(({ report, target }) => ({ id: report.id, title: target.name, meta: FIELDS[report.field], field: FIELDS[report.field], reason: report.reason, targetId: target.id, value: report.field === "name" ? target.name : report.field === "bio" ? target.bio : "", at: report.createdAt.toISOString() }));
  } else if (tab === "questions") {
    items = (await db.select({ post: qaPosts, doc: documents }).from(qaPosts).innerJoin(documents, eq(qaPosts.documentId, documents.id)).where(eq(qaPosts.hidden, true)).orderBy(desc(qaPosts.createdAt)).limit(100))
      .map(({ post, doc }) => ({ id: post.id, title: post.body.slice(0, 80), meta: doc.title, body: post.body, docId: doc.id, at: post.createdAt.toISOString() }));
  } else if (tab === "fiches") {
    items = (await db.select({ card: memoCardReports, doc: documents }).from(memoCardReports).innerJoin(documents, eq(memoCardReports.documentId, documents.id)).where(eq(memoCardReports.status, "open")).orderBy(desc(memoCardReports.reports)).limit(100))
      .map(({ card, doc }) => ({ id: `${card.documentId}:${card.cardKey}`, title: card.front.slice(0, 80), meta: `${doc.title} · ${card.reports} signalement${card.reports > 1 ? "s" : ""}`, front: card.front, back: card.back, docId: doc.id, cardKey: card.cardKey }));
  } else {
    const rows = await db.select({ req: courseRequests, subject: subjects.name, programId: subjects.programId, votes: count(courseRequestVotes.userId) }).from(courseRequests).innerJoin(subjects, eq(courseRequests.subjectId, subjects.id))
      .leftJoin(courseRequestVotes, eq(courseRequestVotes.requestId, courseRequests.id)).where(and(isNull(courseRequests.answeredAt), isNull(courseRequests.mergedInto))).groupBy(courseRequests.id, subjects.name, subjects.programId).orderBy(asc(subjects.name), asc(courseRequests.createdAt)).limit(200);
    items = rows.map(({ req, subject, votes }) => ({ id: req.id, title: req.text, meta: `${subject} · ${votes} vote${votes > 1 ? "s" : ""}`, text: req.text, subjectId: req.subjectId, subject, votes, at: req.createdAt.toISOString() }));
    subjectList = await db.select({ id: subjects.id, name: subjects.name }).from(subjects).where(isNull(subjects.archivedAt)).orderBy(asc(subjects.name));
  }
  return (
    <Shell user={admin} width="wide">
      <AdminHeader title="Modération" section="contenus" current="/admin/moderation" program={false} />
      <SegmentedTabs label="Files" value={tab} className="mb-6" items={TABS.map(([value, label]) => ({ value, label, count: counts[value], href: value === "signalements" ? "/admin/moderation" : `/admin/moderation?onglet=${value}` }))} />
      <ModerationView key={tab} tab={tab} items={items as never} subjects={subjectList} shortcuts={admin.prefs.shortcuts !== false} />
    </Shell>
  );
}
