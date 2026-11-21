import { and, asc, eq, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { cn } from "cn";
import { listAnnotations } from "@/app/actions/annotations";
import { MemoPanel } from "@/components/ai-memo";
import { AnnotationLayer } from "@/components/annotations/annotation-layer";
import { Avatar } from "@/components/avatar";
import { Breadcrumb } from "@/components/breadcrumb";
import { CourseBody, courseToc } from "@/components/course-body";
import { DocRating, RatingSummary } from "@/components/doc-rating";
import { Hint } from "@/components/hint";
import { Icon } from "@/components/icon";
import { Logo } from "@/components/logo";
import { NotionDatabases } from "@/components/notion-databases";
import { NotionView } from "@/components/notion-view";
import { PageTitle } from "@/components/page-title";
import { QuestionsSection } from "@/components/qa";
import { DocToolbar, EndBlock, ReadingBar, RevisedButton, type MoreEntry } from "@/components/reading/course-chrome";
import { DocFrame } from "@/components/reading/doc-frame";
import { CoursePodcast } from "@/components/reading/podcast";
import { GuardedLink, ThanksButton } from "@/components/reading/doc-actions";
import { ShareWithFriends } from "@/components/contribute/share-friends";
import { ReviewBar } from "@/components/review/review-bar";
import { FileType, getFileType } from "@/components/reui/file-type";
import { Shell } from "@/components/shell";
import { EmptyState } from "@/components/empty-state";
import { richContext } from "@/lib/rich/context";
import { readingLimited } from "@/lib/download-guard";
import { countsAsRead } from "@/lib/download-rules";
import { StatusBadge } from "@/components/status-badge";
import { ReadingTracker } from "@/components/study";
import { buttonVariants } from "@/components/ui/button";
import { UserName } from "@/components/user-name";
import { Viewer } from "@/components/viewer";
import { canModerate } from "@/lib/access";
import { canEdit, canRead } from "@/lib/access-server";
import { aiAvailable } from "@/lib/ai-available";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { RIGHTS_SHORT } from "@/lib/db/categories";
import { CATEGORIES } from "@/lib/db/schema";
import { loadDocStats } from "@/lib/doc-stats";
import { sharesOf } from "@/lib/document-shares";
import { formatDate, formatSize, visibleDocument } from "@/lib/documents";
import { env } from "@/lib/env";
import { friendsOf } from "@/lib/friends";
import { SANDBOX_POLICY } from "@/lib/http";
import { IconChevronRight, IconContent, IconEdit, IconExternal, IconFlag, IconHidden, IconQuiz, IconReviewed, IconSubjects } from "@/lib/icons";
import { loadDatabases, loadSnapshot } from "@/lib/notion";
import { namer } from "@/lib/user-name";
import { profilesOf } from "@/lib/profile-data";
import { canSeeProfile } from "@/lib/profile-access";
import { impactSentence } from "@/lib/reminders/impact";
import { weeklyReaders } from "@/lib/reminders/readers";
import { revisionAccess } from "@/lib/revision";
import { viewToken } from "@/lib/security";
import { inSentence } from "@/lib/subject-name";

export const metadata: Metadata = { title: "Document" };

const count = (n: number, one: string, many: string) => `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`;

export default async function DocumentPage({ params, searchParams }: PageProps<"/d/[id]">) {
  const user = await requireUser();
  const { doc, subject, program, files } = await visibleDocument((await params).id, user);
  // Anti-aspiration : au-delà de quelques centaines de pages de cours par heure, la lecture attend
  if (countsAsRead(doc, user) && await readingLimited(user)) {
    return <Shell user={user} width="reading"><EmptyState icon={IconHidden} title="Beaucoup de cours ouverts en une heure" description="Fais une pause : la lecture reprend au fil de l’heure." /></Shell>;
  }
  const viewUrl = doc.entryPath && doc.contentVersion
    ? `${env.contentOrigin}/view/${viewToken(doc.id, user.id)}/${doc.entryPath.split("/").map(encodeURIComponent).join("/")}` : null;
  const notion = doc.kind === "notion" && doc.contentVersion && doc.notionPageId
    ? await loadSnapshot(doc.id, doc.contentVersion, doc.notionPageId) : null;
  const pdf = files.find((f) => f.inlineType === "application/pdf");
  const isCourse = doc.kind === "editor" && doc.bodyMarkdown !== null;
  // Les blocs riches du cours (artefacts isolés, figures TikZ en cache)
  const rich = isCourse ? await richContext(doc.id, user.id, doc.bodyMarkdown!) : {};
  // Rien ici n'est gardé d'une requête à l'autre : tout dépend du compte qui lit, l'accès est déjà vérifié au-dessus
  const [editable, [favorite], [progress], coauthors, [priorDownload], [author], allThanks, [memo], [read], [pendingRevision], nextChapter, ai] = await Promise.all([
    canEdit(user, doc),
    db.select().from(schema.favorites).where(and(eq(schema.favorites.userId, user.id), eq(schema.favorites.documentId, doc.id))),
    db.select().from(schema.readingProgress).where(and(eq(schema.readingProgress.userId, user.id), eq(schema.readingProgress.documentId, doc.id))),
    db.select({ id: schema.users.id, name: schema.users.name, role: schema.users.role, programId: schema.users.programId, status: schema.users.status, avatarKey: schema.users.avatarKey }).from(schema.docAuthors).innerJoin(schema.users, eq(schema.docAuthors.userId, schema.users.id)).where(eq(schema.docAuthors.documentId, doc.id)),
    db.select({ id: schema.attestations.id }).from(schema.attestations).where(and(eq(schema.attestations.userId, user.id), eq(schema.attestations.documentId, doc.id), eq(schema.attestations.kind, "download"))).limit(1),
    doc.createdBy ? db.select().from(schema.users).where(eq(schema.users.id, doc.createdBy)) : [],
    db.select({ u: schema.thanks.userId }).from(schema.thanks).where(eq(schema.thanks.documentId, doc.id)),
    db.select().from(schema.memoDecks).where(eq(schema.memoDecks.documentId, doc.id)),
    db.select().from(schema.revised).where(and(eq(schema.revised.documentId, doc.id), eq(schema.revised.userId, user.id))),
    db.select({ id: schema.revisions.id }).from(schema.revisions).where(and(eq(schema.revisions.documentId, doc.id), eq(schema.revisions.status, "pending"))).limit(1),
    // Chapitre suivant : même matière, chapitre + 1, publié et lisible
    doc.subjectId && doc.chapter
      ? db.select().from(schema.documents).where(and(eq(schema.documents.subjectId, doc.subjectId), eq(schema.documents.chapter, doc.chapter + 1), eq(schema.documents.published, true), isNull(schema.documents.deletedAt))).limit(5)
        .then(async (list) => { for (const other of list) if (await canRead(user, other)) return other; return null; })
      : null,
    aiAvailable(),
  ]);
  const stats = await loadDocStats(doc.id, doc.createdBy, user.id);
  const isAuthor = doc.createdBy === user.id || coauthors.some((c) => c.id === user.id);
  const weeklyImpact = isAuthor && doc.published ? (await weeklyReaders(user.id)).perDoc.get(doc.id) ?? 0 : 0;
  const downloadAttested = Boolean(priorDownload) || doc.createdBy === user.id;

  // La couche de révision : la sienne, ou celle d'un ami qui nous a invité
  const wanted = (await searchParams).revision;
  const sharedAccess = typeof wanted === "string" && z.uuid().safeParse(wanted).success ? await revisionAccess(wanted, user.id) : null;
  const joined = sharedAccess && !sharedAccess.owner && sharedAccess.space.documentId === doc.id ? sharedAccess.space : null;
  const [[mine], invited, [joinedOwner]] = await Promise.all([
    isCourse ? db.select().from(schema.revisionSpaces).where(and(eq(schema.revisionSpaces.documentId, doc.id), eq(schema.revisionSpaces.ownerId, user.id))) : [],
    isCourse ? db.select({ id: schema.revisionSpaces.id, label: schema.users.name }).from(schema.revisionMembers).innerJoin(schema.revisionSpaces, eq(schema.revisionMembers.spaceId, schema.revisionSpaces.id)).innerJoin(schema.users, eq(schema.revisionSpaces.ownerId, schema.users.id)).where(and(eq(schema.revisionMembers.userId, user.id), eq(schema.revisionMembers.status, "accepted"), eq(schema.revisionSpaces.documentId, doc.id))) : [],
    joined ? db.select({ id: schema.users.id, name: schema.users.name, avatarKey: schema.users.avatarKey }).from(schema.users).where(eq(schema.users.id, joined.ownerId)) : [],
  ]);
  // Pendant un « voir comme », les annotations restent privées, même pour l'équipe
  const previewing = Boolean(user.viewing);
  const spaceId = previewing ? null : joined?.id ?? mine?.id ?? null;
  // Le partage n'existe que sur un cours publié : inutile de vérifier les droits de chaque ami sur un brouillon
  const [rows, members, friends] = await Promise.all([
    spaceId ? listAnnotations(spaceId) : [],
    spaceId ? db.select({ id: schema.users.id, name: schema.users.name, avatarKey: schema.users.avatarKey, status: schema.revisionMembers.status }).from(schema.revisionMembers).innerJoin(schema.users, eq(schema.revisionMembers.userId, schema.users.id)).where(eq(schema.revisionMembers.spaceId, spaceId)).orderBy(asc(schema.users.name)) : [],
    isCourse && doc.published && !joined ? friendsOf(user.id).then((list) => Promise.all(list.map(async (f) => ((await canRead(f, doc)) ? f : null)))).then((list) => list.filter((f) => f !== null)) : [],
  ]);
  const shared = Boolean(joined) || members.some((m) => m.status === "accepted");
  // Avant publication, l'auteur ouvre son document en lecture à des amis choisis (hors aperçu « voir comme »)
  const canShare = isAuthor && !doc.published && !doc.hiddenByReports && !previewing;
  const [shareFriends, sharedWith] = canShare ? await Promise.all([friendsOf(user.id).then((list) => list.map(({ id, name, avatarKey }) => ({ id, name, avatarKey }))), sharesOf(doc.id)]) : [null, []];

  const toc = isCourse ? courseToc(doc.bodyMarkdown!) : [];
  const noteCount = rows.filter((r) => r.kind === "note" && !r.parentId).length;
  const minutes = Math.max(1, Math.round(doc.bodyText.split(/\s+/).length / 220));
  const reviewMode = !doc.published ? "validate" as const : pendingRevision ? "revision" as const : doc.postReviewAt && !doc.reviewedAt ? "post" as const : null;
  const more: MoreEntry[] = [
    // Tout lecteur propose une modification d'un cours publié ; un délégué ou l'administration la valide
    ...(doc.published && doc.kind === "editor" && !doc.hiddenByReports && !previewing ? [{ href: `/corriger/${doc.id}`, label: "Proposer une modification", icon: IconEdit }] : []),
    { href: `/contact?doc=${doc.id}`, label: "Signaler", icon: IconFlag },
    ...(user.role === "admin" ? [{ href: `/admin/documents/${doc.id}`, label: "Fiche admin", icon: IconContent }] : []),
  ];
  const extras = [
    ...(files.length ? [{ href: "#pieces-jointes", label: `Pièces jointes (${files.length})` }] : []),
    { href: "#fiches-memo", label: "Fiches mémo" },
    ...(doc.published ? [{ href: "#questions", label: "Questions" }] : []),
  ];
  const chrome = {
    docId: doc.id, read: (progress?.percent ?? 0) >= 97, favorite: Boolean(favorite), course: isCourse, shareable: doc.published && !doc.hiddenByReports, notes: noteCount, hideNotes: previewing,
    editHref: editable ? `/editer/${doc.id}` : undefined, more, files: files.length, offlinePath: doc.kind === "editor" && doc.published ? `/d/${doc.id}` : undefined,
    reviseEntries: { quizReady: doc.quizStatus === "ready", revised: Boolean(read), course: isCourse, published: doc.published, ai, memo: Boolean(memo), canRegenerateQuiz: user.role === "admin" && doc.published && doc.quizStatus !== "pending" },
  };
  const people = [...(author ? [author] : []), ...coauthors.filter((c) => c.id !== author?.id)];
  // Nom montré selon la règle unique (amis : entier, autres : « Prénom N. »)
  const nameOf = await namer(user);
  const authorProfiles = await profilesOf(people.map((p) => p.id));
  const visiblePeople = people.filter((p) => canSeeProfile(user, p)).map((p) => ({ ...p, name: nameOf(p) }));
  const chapter = [doc.chapter ? `Chapitre ${doc.chapter}` : "", doc.teacherName].filter(Boolean).join(" · ");
  const facts = [isCourse ? `${minutes} min` : "", stats.readers ? count(stats.readers, "lecteur", "lecteurs") : ""].filter(Boolean);
  const sharing = isCourse ? {
    docId: doc.id, spaceId, owner: !joined, ownerName: joinedOwner?.name ?? "", friends, members, published: doc.published,
    spaces: invited, current: joined?.id ?? null, friendCode: user.friendCode ?? null,
  } : undefined;

  return (
    <Shell user={user} width="reading">
      <PageTitle title={doc.title || "Sans titre"} />
      <DocFrame items={toc} extras={extras} stickyTop="6.5rem" className={isCourse ? undefined : "[--measure:60rem]"}>
        {isCourse && (
          // Le PDF officiel : en-tête Campuss sur la première page ; les en-têtes et pieds de chaque page viennent de printCourse
          <div className="print-head hidden" data-print-meta data-title={doc.title || "Sans titre"} data-subject={subject ? inSentence(subject.name) : program.name}
            data-author={visiblePeople.map((p) => p.name).join(", ") || (author ? "Un ancien étudiant" : "")} data-reader={user.name}>
            <Logo className="print-logo" />
            <p className="print-kicker">{[subject ? inSentence(subject.name) : program.name, chapter].filter(Boolean).join(" · ")}</p>
            <h1 className="print-title">{doc.title || "Sans titre"}</h1>
            <p className="print-byline">{[visiblePeople.map((p) => p.name).join(", ") || (author ? "Un ancien étudiant" : ""), `Mis à jour le ${formatDate(doc.updatedAt)}`].filter(Boolean).join(" · ")}</p>
          </div>
        )}
        <header className={isCourse ? "print:hidden" : undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {doc.coverFileId && <img src={`/files/${doc.coverFileId}?inline=1`} alt="" fetchPriority="high" className="span-gutter mb-6 aspect-[3/1] w-full rounded-xl object-cover print:hidden" />}
          <div className="max-md:hidden print:hidden">
            <Breadcrumb items={[{ label: program.name, href: "/matieres" }, ...(subject ? [{ label: subject.name, href: `/matieres/${subject.id}` }] : []), { label: doc.title || "Sans titre" }]} />
          </div>
          <p className="text-sm font-semibold text-brand-text">
            {CATEGORIES[doc.category]}{chapter && <span className="font-normal text-muted-foreground"> · {chapter}</span>}
            {doc.published && doc.reviewedAt && <span className="ml-2 inline-flex items-center gap-1 align-middle font-normal text-success-foreground" title={`Relu le ${formatDate(doc.reviewedAt)}`}><Icon icon={IconReviewed} size={16} />Relu par un délégué</span>}
            {author?.role === "teacher" && <span className="ml-2 inline-flex items-center gap-1 align-middle font-normal text-info-foreground"><Icon icon={IconSubjects} size={16} />Cours de l’enseignant</span>}
          </p>
          <h1 className="title mt-1 wrap-break-word" style={{ viewTransitionName: `doc-${doc.id}` }}>{doc.title || "Sans titre"}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
            {visiblePeople.length > 0
              ? visiblePeople.map((p) => <Link key={p.id} href={`/u/${p.id}`} className="inline-flex items-center gap-2 text-foreground hover-ok:underline"><Avatar user={p} size={24} /><UserName user={p} profile={authorProfiles.get(p.id)} variant="rich" showBadge self={p.id === user.id} /></Link>)
              : author && <span>Un ancien étudiant</span>}
            {facts.map((f) => <span key={f} className="before:mr-2 before:content-['·']">{f}</span>)}
            {doc.published && <RatingSummary average={stats.average} count={stats.count} className="text-sm before:mr-1 before:content-['·']" />}
            {/* L'état du document ne regarde que ses auteurs (et la relecture tant qu'il n'est pas publié) : un lecteur ou un ami ne voit pas de pastille */}
            {isAuthor && doc.published && <StatusBadge status={doc.postReviewAt ? "postreview" : "published"} size="sm" className="ml-1" />}
            {!doc.published && (isAuthor || canModerate(user, doc)) && <StatusBadge status={doc.reviewRequested ? "pending" : doc.reviewNote ? "tofix" : "draft"} size="sm" className="ml-1" />}
            {shareFriends && <span className="ml-1"><ShareWithFriends docId={doc.id} friends={shareFriends} shared={sharedWith.map((f) => f.id)} /></span>}
          </div>
          {weeklyImpact > 0 && <p className="mt-3 text-sm font-semibold">{impactSentence(weeklyImpact)}</p>}
          {/* Un sujet de partiel est une ressource pour s'entraîner, rangée dans Réviser */}
          {doc.category === "partiel" && doc.published && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-muted/60 px-4 py-3 text-sm print:hidden">
              <span className="min-w-0 flex-1">Sujet de partiel pour s’entraîner · <Link href="/reviser/partiels#sujets" className="text-link hover:underline">tous les sujets dans Réviser</Link></span>
              {doc.quizStatus === "ready" && <Link href={`/d/${doc.id}/quiz`} data-slot="button" className={buttonVariants({ size: "sm", variant: "outline" })}>S’entraîner</Link>}
            </div>
          )}
        </header>
        <DocToolbar {...chrome} />
        {canModerate(user, doc) && reviewMode && (
          <div className="review-wrap sticky top-[calc(6.5rem+env(safe-area-inset-top))] z-(--z-sticky) mt-4 grid gap-1 print:hidden">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Relecture</span>
            <div className="review-slot"><ReviewBar documentId={doc.id} mode={reviewMode} /></div>
          </div>
        )}
        {doc.description && <p className="mt-6 whitespace-pre-line text-pretty">{doc.description}</p>}
        {doc.externalUrl && <p className="mt-4"><a className="inline-flex items-center gap-1.5 text-link underline underline-offset-2" href={doc.externalUrl} target="_blank" rel="noopener noreferrer">Ouvrir le lien du projet<Icon icon={IconExternal} size={16} /></a></p>}
        {isCourse && (
          <div className="mt-8">
            <ReadingTracker docId={doc.id} initial={progress?.percent ?? 0} />
            {previewing ? <>
              <p className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground print:hidden"><Icon icon={IconHidden} size={16} />Annotations et notes privées · Masqué en aperçu</p>
              <CourseBody markdown={doc.bodyMarkdown!} rich={rich} />
            </> : <AnnotationLayer docId={doc.id} initialSpace={spaceId} initialRows={rows} me={{ id: user.id, name: user.name, avatarKey: user.avatarKey }} owner={!joined} shared={shared} sharing={sharing}>
              {rows.length === 0 && <Hint id="annoter" text="Sélectionne du texte pour l’annoter" seen={user.prefs?.hints} side="top"><span aria-hidden="true" className="block h-px w-24" /></Hint>}
              <CourseBody markdown={doc.bodyMarkdown!} rich={rich} />
            </AnnotationLayer>}
          </div>
        )}
        {viewUrl && <div className="mt-6"><Viewer src={viewUrl} title={doc.title} sandbox={SANDBOX_POLICY} storageKey={doc.id} /></div>}
        {doc.kind === "notion" && (notion
          ? <div className="mt-6 rounded-xl bg-card p-2 shadow-xs sm:p-6"><NotionView recordMap={notion} docId={doc.id} rootPage={doc.notionPageId!} /><NotionDatabases docId={doc.id} databases={await loadDatabases(doc.id, doc.contentVersion!, doc.notionPageId!)} /></div>
          : <p role="status" className="mt-6 text-muted-foreground">{doc.syncError ?? "Import depuis Notion en cours. Recharge la page dans un instant."}</p>)}
        {!viewUrl && doc.kind !== "notion" && doc.kind !== "editor" && pdf && <div className="mt-6"><Viewer src={`/files/${pdf.id}?inline=1`} title={pdf.filename} popout={false} /></div>}

        <EndBlock>
          {doc.published && !isAuthor && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="heading">{doc.category === "partiel" ? "Ce sujet t’a aidé ?" : "Ce cours t’a aidé ?"}</p>
              <DocRating docId={doc.id} initial={stats.mine} average={stats.average} count={stats.count} />
              <ThanksButton docId={doc.id} thanked={allThanks.some((t) => t.u === user.id)} count={allThanks.length} />
            </div>
          )}
          {isAuthor && allThanks.length > 0 && <p className="mb-3 text-sm text-muted-foreground">{count(allThanks.length, "merci", "mercis")} pour ce cours</p>}
          <div className={doc.published && !isAuthor ? "mt-4 flex flex-wrap gap-2 border-t border-border pt-4" : "flex flex-wrap gap-2"}>
            <RevisedButton key={String(Boolean(read))} docId={doc.id} initial={Boolean(read)} />
            {doc.quizStatus === "ready" && <Link href={`/d/${doc.id}/quiz`} data-slot="button" className={buttonVariants({ variant: "outline" })}><Icon icon={IconQuiz} />Lancer le quiz</Link>}
            {nextChapter && (
              <Link href={`/d/${nextChapter.id}`} data-slot="button" className={cn(buttonVariants({ variant: "outline" }), "sm:ml-auto")}>
                <span className="grid text-left leading-tight"><span className="text-xs text-muted-foreground">Chapitre suivant</span><span className="line-clamp-1">{nextChapter.title || "Sans titre"}</span></span><Icon icon={IconChevronRight} />
              </Link>
            )}
          </div>
        </EndBlock>

        {files.length > 0 && (
          <section id="pieces-jointes" aria-label="Pièces jointes" className="mt-12 scroll-mt-32 print:hidden">
            <h2 className="heading mb-3">Pièces jointes</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {files.map((f) => (
                <li key={f.id} className="flex min-w-0 items-center gap-3 rounded-xl bg-card p-3 shadow-xs">
                  <FileType type={getFileType(f.filename)} size="sm" />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate font-semibold" title={f.filename}>{f.filename}</span>
                    <span className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
                      {formatSize(f.size)}
                      {f.inlineType && <GuardedLink docId={doc.id} attested={downloadAttested} href={`/files/${f.id}?inline=1`} newTab>Ouvrir</GuardedLink>}
                      <GuardedLink docId={doc.id} attested={downloadAttested} href={`/files/${f.id}`}>Télécharger</GuardedLink>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div id="fiches-memo" className="scroll-mt-32"><MemoPanel docId={doc.id} initial={memo?.cards ?? null} aiReady={ai} /></div>
        {doc.published && <QuestionsSection doc={doc} user={user} />}
        <p className="mt-10 text-sm text-muted-foreground print:hidden">{RIGHTS_SHORT[doc.rightsBasis] ? `${RIGHTS_SHORT[doc.rightsBasis]} · ` : ""}Mis à jour le {formatDate(doc.updatedAt)} · Ne rediffuse pas ce contenu hors de Campuss</p>
        {!isCourse && <p className="print-footer hidden">Campuss, pour {user.name}, ne pas rediffuser</p>}
      </DocFrame>
      <ReadingBar {...chrome} toc={toc} extras={extras} />
      {isCourse && <CoursePodcast docId={doc.id} />}
    </Shell>
  );
}
