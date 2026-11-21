import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ago, dateTime, PersonStatus, renderedAt, roleLabel, shortDate } from "@/components/admin/badges";
import { AccessPanel } from "@/components/admin/person-access";
import { PersonActions } from "@/components/admin/person-actions";
import { CreditsPanel } from "@/components/admin/person-credits";
import { NotesPanel } from "@/components/admin/person-notes";
import { ProfileEditor } from "@/components/admin/person-profile";
import { RightsTester } from "@/components/admin/rights-tester";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { Stat } from "@/components/stat";
import { StatusBadge, statusOf } from "@/components/status-badge";
import { UserName } from "@/components/user-name";
import { actionLabel, MANUAL_BADGES } from "@/lib/admin-actions";
import { auditAction } from "@/lib/audit";
import { listPrograms } from "@/lib/catalog";
import { db, schema } from "@/lib/db";
import { CATEGORIES } from "@/lib/db/categories";
import type { User } from "@/lib/db/schema";
import { BADGES, creditsOf, levelOf } from "@/lib/gamification";
import { IconPin } from "@/lib/icons";
import { featureOn } from "@/lib/site-settings";

export const FILE_TABS = [["apercu", "Aperçu"], ["profil", "Profil"], ["acces", "Accès et sécurité"], ["contenus", "Contenus"], ["credits", "Crédits et badges"], ["activite", "Activité"], ["droits", "Droits"], ["journal", "Journal"], ["notes", "Notes internes"]] as const;
export type FileTab = (typeof FILE_TABS)[number][0];

const { users, documents, auditLog, adminNotes } = schema;

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return <section className="grid gap-3">{title && <h3 className="heading">{title}</h3>}{children}</section>;
}
function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-6 gap-y-2 text-sm">{rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 wrap-break-word">{v}</dd></div>)}</dl>;
}

/** Fiche d'une personne : panneau latéral depuis la grille, page pleine au téléphone. Onglets dans l'URL. */
export async function PersonFile({ id, tab, admin, base }: { id: string; tab: FileTab; admin: User; base: (tab: FileTab) => string }) {
  const [person] = await db.select().from(users).where(eq(users.id, id));
  if (!person) notFound();
  const [programs, credits] = await Promise.all([listPrograms(), creditsOf(person.id)]);
  const program = programs.find((p) => p.id === person.programId);
  const self = person.id === admin.id;
  const suspended = Boolean(person.suspendedUntil && person.suspendedUntil > new Date());

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start gap-4">
        <Avatar user={person} size={56} />
        <div className="grid min-w-0 flex-1 gap-1">
          <p className="text-xl font-semibold"><UserName user={person} variant="dense" /></p>
          <p className="text-sm text-muted-foreground wrap-break-word">{person.email}{person.pendingEmail ? ` → ${person.pendingEmail} (à confirmer)` : ""}</p>
          <p className="flex flex-wrap items-center gap-2 text-sm"><PersonStatus status={person.status} suspended={suspended} deletion={Boolean(person.deletionScheduledAt)} /><span className="text-muted-foreground">{roleLabel(person.role, person.isOwner)}</span></p>
        </div>
        {!self && <PersonActions person={{ id: person.id, name: person.name, email: person.email, status: person.status, role: person.role, isOwner: person.isOwner, suspended, deletion: Boolean(person.deletionScheduledAt) }} editHref={base("profil")} />}
      </header>
      <SegmentedTabs label="Fiche" value={tab} items={FILE_TABS.map(([value, label]) => ({ value, label, href: base(value) }))} />
      <div className="motion-ok:animate-rise">
        {tab === "apercu" && <Overview person={person} programName={program?.name} credits={credits} />}
        {tab === "profil" && <ProfileEditor person={{ id: person.id, name: person.name, pronouns: person.pronouns, bio: person.bio, email: person.email, programId: person.programId, level: person.level, favoriteSubjectId: person.favoriteSubjectId, friendCode: person.friendCode, avatar: Boolean(person.avatarKey) }}
          programs={programs.map((p) => ({ id: p.id, name: p.name }))} subjects={await subjectsFor(person.programId)} self={self} />}
        {tab === "acces" && <AccessTab person={person} self={self} suspended={suspended} />}
        {tab === "contenus" && <Contents person={person} />}
        {tab === "credits" && <CreditsTab person={person} credits={credits} />}
        {tab === "activite" && <Activity person={person} admin={admin} />}
        {tab === "droits" && <Rights person={person} programName={program?.name} />}
        {tab === "journal" && <Journal person={person} />}
        {tab === "notes" && <Notes person={person} />}
      </div>
    </div>
  );
}

const subjectsFor = async (programId: number | null) => programId
  ? (await db.select({ id: schema.subjects.id, name: schema.subjects.name, level: schema.subjects.level }).from(schema.subjects).where(and(eq(schema.subjects.programId, programId), isNull(schema.subjects.archivedAt))).orderBy(schema.subjects.level, schema.subjects.position))
  : [];

async function Overview({ person, programName, credits }: { person: User; programName?: string; credits: number }) {
  const [[docs], badges, notes, invitedBy, invited] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int`, published: sql<number>`count(*) filter (where ${documents.published})::int` }).from(documents).where(and(eq(documents.createdBy, person.id), isNull(documents.deletedAt))),
    db.select().from(schema.userBadges).where(and(eq(schema.userBadges.userId, person.id), isNull(schema.userBadges.revokedAt))),
    db.select().from(adminNotes).where(and(eq(adminNotes.userId, person.id), eq(adminNotes.pinned, true))).orderBy(desc(adminNotes.createdAt)).limit(3),
    person.invitedBy ? db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, person.invitedBy)) : Promise.resolve([]),
    db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.invitedBy, person.id)),
  ]);
  const badgeName = (id: string) => BADGES.find((b) => b.id === id)?.name ?? MANUAL_BADGES.find((b) => b.id === id)?.name ?? id;
  return (
    <div className="grid gap-8">
      <div className="grid grid-cols-2 items-start gap-4 sm:grid-cols-4 [&>*]:content-start">
        <Stat value={credits} label="crédits" hint={levelOf(credits).name} />
        <Stat value={docs.published} label="cours publiés" hint={`${docs.n} en tout`} />
        <Stat value={badges.length} label="badges" />
        <Stat value={invited[0]?.n ?? 0} label="invitations acceptées" />
      </div>
      {notes.length > 0 && (
        <Section title="Notes épinglées">
          <ul className="grid gap-2">{notes.map((n) => <li key={n.id} className="flex gap-2 rounded-lg bg-muted px-3 py-2 text-sm"><Icon icon={IconPin} size={16} className="mt-0.5 text-muted-foreground" /><span className="whitespace-pre-line wrap-break-word">{n.body}</span></li>)}</ul>
        </Section>
      )}
      <Facts rows={[
        ["Licence", programName ? `${programName}${person.level ? ` · L${person.level}` : ""}` : "Aucune"],
        ["Inscription", shortDate(person.createdAt)],
        ["Dernière connexion", ago(person.lastLoginAt)],
        ["Invité par", invitedBy[0] ? <Link className="text-link underline-offset-2 hover:underline" href={`/admin/personnes/${invitedBy[0].id}`}>{invitedBy[0].name}</Link> : "—"],
        ["Badges", badges.length ? badges.map((b) => badgeName(b.badge)).join(", ") : "Aucun"],
        ["Profil public", <Link key="p" className="text-link underline-offset-2 hover:underline" href={`/u/${person.id}`}>Voir</Link>],
      ]} />
    </div>
  );
}

async function AccessTab({ person, self, suspended }: { person: User; self: boolean; suspended: boolean }) {
  const [sessions, keys, codes, [mfaRequest]] = await Promise.all([
    db.select().from(schema.sessions).where(eq(schema.sessions.userId, person.id)).orderBy(desc(schema.sessions.lastSeenAt)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.passkeys).where(eq(schema.passkeys.userId, person.id)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.recoveryCodes).where(and(eq(schema.recoveryCodes.userId, person.id), isNull(schema.recoveryCodes.usedAt))),
    db.select({ createdAt: schema.mfaResetRequests.createdAt, reason: schema.mfaResetRequests.reason }).from(schema.mfaResetRequests)
      .where(and(eq(schema.mfaResetRequests.userId, person.id), eq(schema.mfaResetRequests.status, "open"))).orderBy(desc(schema.mfaResetRequests.createdAt)).limit(1),
  ]);
  // Enseignant : ses matières (sans elles, il ne voit aucun cours)
  const [taught, allSubjects] = person.role === "teacher" ? await Promise.all([
    db.select({ id: schema.subjectTeachers.subjectId }).from(schema.subjectTeachers).where(eq(schema.subjectTeachers.userId, person.id)),
    db.select({ id: schema.subjects.id, name: schema.subjects.name, level: schema.subjects.level, program: schema.programs.name }).from(schema.subjects).innerJoin(schema.programs, eq(schema.subjects.programId, schema.programs.id))
      .where(isNull(schema.subjects.archivedAt)).orderBy(schema.programs.position, schema.subjects.level, schema.subjects.name),
  ]) : [[], []];
  return <AccessPanel now={renderedAt()} self={self} teaching={person.role === "teacher" ? { subjects: allSubjects, taught: taught.map((t) => t.id) } : null} person={{
    id: person.id, name: person.name, email: person.email, role: person.role, status: person.status, isOwner: person.isOwner, suspended,
    suspendedUntil: person.suspendedUntil?.toISOString() ?? null, suspensionReason: person.suspensionReason, suspensionMessage: person.suspensionMessage,
    deletionScheduledAt: person.deletionScheduledAt?.toISOString() ?? null, totp: person.totpEnabled, passkeys: keys[0]?.n ?? 0, recoveryCodes: codes[0]?.n ?? 0, mustChangePassword: person.mustChangePassword,
    mfaRequest: mfaRequest ? { at: mfaRequest.createdAt.toISOString(), reason: mfaRequest.reason } : null,
  }} sessions={sessions.map((s) => ({ key: s.tokenHash.slice(0, 12), agent: s.userAgent, ip: s.ip, lastSeenAt: s.lastSeenAt.toISOString(), createdAt: s.createdAt.toISOString() }))} />;
}

async function Contents({ person }: { person: User }) {
  const [docs, corrections, requests, reports] = await Promise.all([
    db.select().from(documents).where(or(eq(documents.createdBy, person.id), sql`exists (select 1 from doc_authors a where a.document_id = ${documents.id} and a.user_id = ${person.id})`)).orderBy(desc(documents.updatedAt)).limit(100),
    db.select({ id: schema.revisions.id, documentId: schema.revisions.documentId, status: schema.revisions.status, createdAt: schema.revisions.createdAt }).from(schema.revisions).where(eq(schema.revisions.authorId, person.id)).orderBy(desc(schema.revisions.createdAt)).limit(30),
    db.select().from(schema.courseRequests).where(eq(schema.courseRequests.authorId, person.id)).orderBy(desc(schema.courseRequests.createdAt)).limit(30),
    db.select().from(schema.reports).where(eq(schema.reports.reporterId, person.id)).orderBy(desc(schema.reports.createdAt)).limit(30),
  ]);
  return (
    <div className="grid gap-8">
      <Section title={`Cours · ${docs.length}`}>
        {docs.length ? <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs">{docs.map((d) => (
          <li key={d.id}><Link href={`/d/${d.id}`} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-muted"><span className="min-w-0 truncate font-semibold">{d.title}</span><span className="flex shrink-0 items-center gap-2 text-muted-foreground">{CATEGORIES[d.category]}<StatusBadge status={statusOf(d)} size="default" /></span></Link></li>
        ))}</ul> : <p className="text-sm text-muted-foreground">Aucun cours</p>}
      </Section>
      <Section title={`Corrections proposées · ${corrections.length}`}>{corrections.length ? <ul className="grid gap-1 text-sm">{corrections.map((c) => <li key={c.id}><Link className="text-link hover:underline" href={`/d/${c.documentId}`}>{shortDate(c.createdAt)}</Link> · {c.status}</li>)}</ul> : <p className="text-sm text-muted-foreground">Aucune</p>}</Section>
      <Section title={`Demandes · ${requests.length}`}>{requests.length ? <ul className="grid gap-1 text-sm">{requests.map((r) => <li key={r.id}>{r.text} <span className="text-muted-foreground">· {shortDate(r.createdAt)}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">Aucune</p>}</Section>
      <Section title={`Signalements envoyés · ${reports.length}`}>{reports.length ? <ul className="grid gap-1 text-sm">{reports.map((r) => <li key={r.id} className="wrap-break-word">{r.message.slice(0, 140)} <span className="text-muted-foreground">· {r.status}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">Aucun</p>}</Section>
    </div>
  );
}

async function CreditsTab({ person, credits }: { person: User; credits: number }) {
  const [badges, adjustments, unlocks] = await Promise.all([
    db.select().from(schema.userBadges).where(eq(schema.userBadges.userId, person.id)).orderBy(desc(schema.userBadges.earnedAt)),
    db.select().from(schema.creditAdjustments).where(eq(schema.creditAdjustments.userId, person.id)).orderBy(desc(schema.creditAdjustments.createdAt)).limit(30),
    db.select().from(schema.userUnlocks).where(eq(schema.userUnlocks.userId, person.id)),
  ]);
  const nameOf = (id: string) => BADGES.find((b) => b.id === id)?.name ?? MANUAL_BADGES.find((b) => b.id === id)?.name ?? id;
  return <CreditsPanel personId={person.id} credits={credits} level={levelOf(credits).name}
    badges={badges.map((b) => ({ id: b.badge, name: nameOf(b.badge), earnedAt: b.earnedAt.toISOString(), manual: Boolean(b.grantedBy), revoked: Boolean(b.revokedAt), revokedReason: b.revokedReason }))}
    adjustments={adjustments.map((a) => ({ id: a.id, delta: a.delta, reason: a.reason, at: a.createdAt.toISOString() }))}
    unlocks={unlocks.map((u) => ({ item: u.item, source: u.source, at: u.at.toISOString() }))} />;
}

const DOC_PATH = /^\/d\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;

async function Activity({ person, admin }: { person: User; admin: User }) {
  // L'ouverture de cet onglet est journalisée ; seules les pages des personnes qui ont accepté la mesure d'audience existent
  await auditAction(admin, { action: "fiche.activite", target: { type: "user", id: person.id, label: person.name } });
  const views = await db.select().from(schema.pageViews).where(eq(schema.pageViews.userId, person.id)).orderBy(desc(schema.pageViews.at)).limit(100);
  if (!views.length) return <p className="text-sm text-muted-foreground">Aucune page enregistrée : cette personne n’a pas accepté la mesure d’audience, ou son historique a plus de 6 mois.</p>;
  // Une page de document se lit par son titre, le chemin reste en second
  const docIds = [...new Set(views.map((v) => DOC_PATH.exec(v.path)?.[1]).filter((id): id is string => Boolean(id)))];
  const titles = new Map(docIds.length ? (await db.select({ id: schema.documents.id, title: schema.documents.title }).from(schema.documents).where(inArray(schema.documents.id, docIds))).map((d) => [d.id, d.title]) : []);
  return (
    <section aria-label="Pages consultées">
      <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card text-sm shadow-xs">{views.map((v) => {
        const title = titles.get(DOC_PATH.exec(v.path)?.[1] ?? "");
        return (
          <li key={v.id} className="flex justify-between gap-3 px-4 py-2">
            <span className="grid min-w-0">{title && <span className="truncate font-semibold">{title}</span>}<span className={title ? "truncate text-xs text-muted-foreground" : "truncate"}>{v.path}</span></span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{dateTime(v.at)}</span>
          </li>
        );
      })}</ul>
    </section>
  );
}

async function Rights({ person, programName }: { person: User; programName?: string }) {
  const features = await Promise.all((["ai", "imports", "ranking", "duels", "groups", "bannerImages"] as const).map(async (f) => [f, await featureOn(f)] as const));
  const off = features.filter(([, on]) => !on).map(([f]) => ({ ai: "Campuss IA", imports: "Imports", ranking: "Classement", duels: "Duels", groups: "Groupes", bannerImages: "Bannières en image" })[f]);
  const reads = person.role === "admin" ? "Tous les cours, toutes les licences" : person.role === "teacher" ? "Les cours de ses matières" : programName ? `Les cours publiés de ${programName}, et les siens` : "Ses propres cours seulement (aucune licence)";
  return (
    <div className="grid gap-6">
      <Facts rows={[["Peut lire", reads], ["Peut modérer", person.role === "delegate" ? `Les cours de ${programName ?? "sa licence"}` : person.role === "admin" ? "Tout" : "Non"], ["Fonctions coupées", off.length ? off.join(", ") : "Aucune"]]} />
      <RightsTester personId={person.id} />
      <Attestations person={person} />
    </div>
  );
}

/** Engagements pris (droits, transcription, publication, téléchargement) : gardés comme preuve, même après un retrait de la mesure. */
async function Attestations({ person }: { person: User }) {
  const rows = await db.select().from(schema.attestations).where(eq(schema.attestations.userId, person.id)).orderBy(desc(schema.attestations.at)).limit(50);
  return (
    <section aria-label="Engagements" className="grid gap-2">
      <h2 className="heading">Engagements</h2>
      {rows.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card text-sm shadow-xs">{rows.map((r) => (
          <li key={r.id} className="grid gap-0.5 px-4 py-2">
            <span className="flex justify-between gap-3"><span className="min-w-0 font-semibold">{r.documentTitle || "Sans document"}</span><span className="shrink-0 tabular-nums text-muted-foreground">{dateTime(r.at)}</span></span>
            <span className="text-muted-foreground">{r.text}</span>
          </li>
        ))}</ul>
      ) : <p className="text-sm text-muted-foreground">Aucun engagement</p>}
    </section>
  );
}

async function Journal({ person }: { person: User }) {
  const rows = await db.select().from(auditLog).where(or(and(eq(auditLog.targetType, "user"), eq(auditLog.targetId, person.id)), eq(auditLog.actorId, person.id), eq(auditLog.actor, person.email))).orderBy(desc(auditLog.id)).limit(100);
  if (!rows.length) return <p className="text-sm text-muted-foreground">Rien dans le journal</p>;
  return <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card text-sm shadow-xs">{rows.map((r) => (
    <li key={r.id} className="grid gap-0.5 px-4 py-2">
      <span className="flex justify-between gap-3"><span className="font-semibold">{actionLabel(r.action)}</span><span className="shrink-0 tabular-nums text-muted-foreground">{dateTime(r.at)}</span></span>
      <span className="text-muted-foreground">{r.actorId === person.id ? "Par cette personne" : `Par ${r.actor}`}{r.reason ? ` · ${r.reason}` : ""}</span>
    </li>
  ))}</ul>;
}

async function Notes({ person }: { person: User }) {
  const rows = await db.select({ note: adminNotes, author: users.name }).from(adminNotes).leftJoin(users, eq(adminNotes.authorId, users.id)).where(eq(adminNotes.userId, person.id)).orderBy(desc(adminNotes.pinned), desc(adminNotes.createdAt));
  return <NotesPanel personId={person.id} notes={rows.map((r) => ({ id: r.note.id, body: r.note.body, pinned: r.note.pinned, author: r.author ?? "Ancien admin", at: r.note.createdAt.toISOString() }))} />;
}
