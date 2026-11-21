import { and, count, desc, eq, isNull, or } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";
import { cn } from "cn";
import { DocCard, DocGrid } from "@/components/doc-card";
import { EmptyState } from "@/components/empty-state";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { PageTitle } from "@/components/page-title";
import { sectionsFor } from "@/components/profile/settings/sections";
import { SettingsNav } from "@/components/profile/settings/settings-nav";
import { Icon } from "@/components/icon";
import { ActivityGraph, activitySummary, contributionScale, studyScale } from "@/components/profile/activity-graph";
import { ActivityLayers } from "@/components/profile/activity-layers";
import { BadgeBoard, type BadgeCell } from "@/components/profile/badge-board";
import { ProfileActions } from "@/components/profile/profile-actions";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { memberSinceText, ProfileHero } from "@/components/profile/profile-hero";
import { profileCardStyle } from "@/components/profile/profile-visuals";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { Shell } from "@/components/shell";
import { Stat } from "@/components/stat";
import { countByCategory, presentCategories, publishedWord } from "@/lib/category-counts";
import { requireUser } from "@/lib/auth";
import { badgeBoard } from "@/lib/badges";
import { db, schema } from "@/lib/db";
import { isBlockedBetween } from "@/lib/friends";
import { profileStanding, syncBadges, trophiesOf } from "@/lib/gamification";
import { gameSnapshot } from "@/lib/habits";
import { IconAdd, IconBack, IconTrophy } from "@/lib/icons";
import { activityOf, impactOf, profileOf, visibleStatus } from "@/lib/profile-data";
import { canViewProfile, followsProfile } from "@/lib/people";
import { listPrograms, subjectOptions } from "@/lib/catalog";
import { socialLinks } from "@/lib/socials";
import { namer } from "@/lib/user-name";

/** « 3 CM publiés », « 2 fiches publiées »… ; rien de publié : « 0 cours publié ». */
function publishedByType(byCategory: Record<string, number>): [number, string][] {
  const counts = countByCategory(Object.entries(byCategory).map(([category, n]) => ({ category, n })));
  const present = presentCategories(counts);
  if (!present.length) return [[0, "cours publié"]];
  return present.map((c) => [counts[c]!, publishedWord(c, counts[c]!)]);
}

export const metadata: Metadata = { title: "Profil" };

const TABS = [{ value: "apercu", label: "Aperçu" }, { value: "cours", label: "Cours" }, { value: "badges", label: "Badges" }, { value: "activite", label: "Activité" }] as const;
type Tab = (typeof TABS)[number]["value"];
const nf = new Intl.NumberFormat("fr-FR");
const DAY = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

function Section({ tab, current, title, aside, children, className }: { tab: Tab; current: Tab; title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("grid content-start gap-3", tab !== current && "hidden lg:grid", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="heading">{title}</h2>{aside}</div>
      {children}
    </section>
  );
}

export default async function ProfilePage({ params, searchParams }: PageProps<"/u/[id]">) {
  const viewer = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const [person] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!person || !(await canViewProfile(viewer, person))) notFound();
  const own = viewer.id === person.id;
  // Une personne bloquée, dans un sens ou dans l'autre, n'a pas de profil
  if (!own && await isBlockedBetween(viewer.id, person.id)) notFound();
  if (own) await syncBadges(person.id);
  const tab: Tab = TABS.find((t) => t.value === query.onglet)?.value ?? "apercu";
  const sort = query.tri === "recent" ? "recent" : "merci";

  const [profile, standing, trophies, impact, activity, habits, [friendship], [program], [favorite], docs, unseen] = await Promise.all([
    profileOf(person.id), profileStanding(person), trophiesOf(person), impactOf(person.id), activityOf(person.id), gameSnapshot(person.id),
    own ? Promise.resolve([]) : db.select({ status: schema.friendships.status, requesterId: schema.friendships.requesterId }).from(schema.friendships)
      .where(or(and(eq(schema.friendships.requesterId, viewer.id), eq(schema.friendships.addresseeId, person.id)), and(eq(schema.friendships.requesterId, person.id), eq(schema.friendships.addresseeId, viewer.id)))),
    person.programId ? db.select().from(schema.programs).where(eq(schema.programs.id, person.programId)) : Promise.resolve([]),
    person.favoriteSubjectId ? db.select().from(schema.subjects).where(eq(schema.subjects.id, person.favoriteSubjectId)) : Promise.resolve([]),
    db.select({
      id: schema.documents.id, title: schema.documents.title, category: schema.documents.category, chapter: schema.documents.chapter, semester: schema.documents.semester,
      coverFileId: schema.documents.coverFileId, academicYear: schema.documents.academicYear, teacherName: schema.documents.teacherName, publishedAt: schema.documents.publishedAt,
      subjectId: schema.documents.subjectId, subject: schema.subjects.name, subjectShort: schema.subjects.shortName, thanks: count(schema.thanks.userId),
    }).from(schema.documents).leftJoin(schema.subjects, eq(schema.documents.subjectId, schema.subjects.id)).leftJoin(schema.thanks, eq(schema.thanks.documentId, schema.documents.id))
      .where(and(eq(schema.documents.createdBy, person.id), eq(schema.documents.published, true), isNull(schema.documents.deletedAt)))
      .groupBy(schema.documents.id, schema.subjects.name, schema.subjects.shortName).orderBy(desc(schema.documents.publishedAt)).limit(60),
    own ? db.select({ badge: schema.userBadges.badge }).from(schema.userBadges).where(and(eq(schema.userBadges.userId, person.id), eq(schema.userBadges.seen, false))) : Promise.resolve([]),
  ]);
  const friends = friendship?.status === "accepted";
  const following = !own && await followsProfile(viewer.id, person.id);
  const nameOf = await namer(viewer);
  const shown = { ...person, name: nameOf(person) };
  const relation = friends ? "friends" : friendship?.status === "pending" && friendship.requesterId === viewer.id ? "pending" : "none";
  const privacy = profile?.privacy ?? {};
  const studyShared = own || (friends && privacy.shareStudy === true && privacy.activity !== "none");
  const status = await visibleStatus(profile);
  const { stats } = standing;

  const showcase = profile?.showcase?.docs ?? [];
  const sorted = [...docs].sort((a, b) => (sort === "merci" ? b.thanks - a.thanks : 0) || (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
  const ordered = [...showcase.map((sid) => sorted.find((d) => d.id === sid)).filter((d): d is (typeof docs)[number] => Boolean(d)), ...sorted.filter((d) => !showcase.includes(d.id))];

  const board = badgeBoard(standing.rows, own ? stats : null);
  // Tous les badges, obtenus ou non (grisés, avec leur condition) : sur son profil comme sur celui des autres
  const visible = board;
  const earnedCount = board.filter((v) => v.earnedAt).length;
  const pinned = new Set(profile?.showcase?.badges ?? []);
  const cells: BadgeCell[] = [...visible.filter((v) => pinned.has(v.badge.id)), ...visible.filter((v) => !pinned.has(v.badge.id))]
    .map((v) => ({ id: v.badge.id, earnedAt: v.earnedAt?.toISOString() ?? null, manual: v.manual, value: v.value, target: v.target }));

  const facts = [[person.level ? `L${person.level}` : "", program?.name ?? ""].filter(Boolean).join(" "), person.pronouns, favorite ? `aime ${favorite.name}` : ""].filter(Boolean).join(" · ");
  const numbers: [number | null, string][] = [
    // Par type ; une fiche ou un partiel n'est pas compté comme un cours
    ...publishedByType(stats.byCategory),
    [stats.thanksReceived, stats.thanksReceived > 1 ? "mercis reçus" : "merci reçu"],
    [impact.readers, "étudiants aidés"],
    // Meilleure série du jeu = max(record gardé, série en cours). Le record en base n'est relevé qu'après une révision :
    // lu seul, il affichait « 0 meilleure série » à côté de « 18 jours de série ».
    ...(studyShared ? [[habits.streak, "jours de série"], [habits.best, "meilleure série"]] as [number, string][] : []),
  ];
  const impacts: [number | null, string][] = [[impact.revised, "révisions de ses cours"], [impact.favorites, "mises en favori"], [impact.cards, "fiches tirées de ses cours"], [impact.thanks, "mercis"]];
  const shownImpacts = impacts.filter(([n]) => n !== null);
  const contributionText = activitySummary(activity.contributions, "de contribution");
  const studyText = studyShared ? activitySummary(activity.study, "de révision") : null;

  const level = studyShared ? { level: habits.level.level, xp: habits.xpTotal, into: habits.level.into, span: habits.level.span } : null;
  const memberSince = memberSinceText(person.createdAt);

  if (own && query.modifier === "1") {
    // Matière préférée : celles de son année seulement (l'administration et les enseignants gardent tout)
    const [subjects, programs] = await Promise.all([subjectOptions(person, { ownYear: true, keep: person.favoriteSubjectId }), listPrograms()]);
    const oneYear = new Set(subjects.map((o) => o.level)).size <= 1;
    const editDocs = docs.map((d) => ({ id: d.id, title: d.title || "Sans titre" }));
    const programName = programs.find((p) => p.id === person.programId)?.name ?? "";
    const locked = profile?.appearanceLockedUntil && profile.appearanceLockedUntil > new Date() ? DAY.format(profile.appearanceLockedUntil) : null;
    // Une des sections des paramètres : fil d'Ariane « Paramètres › Profil et apparence » sur ordinateur, et la colonne
    // des paramètres quand l'écran a la place (xl) ; au téléphone, la flèche « ‹ Paramètres » de l'en-tête (back-target.ts)
    return (
      <Shell user={viewer} width="wide">
        <PageTitle title="Profil et apparence" />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[13rem_minmax(0,1fr)] xl:gap-x-10">
          <aside className="hidden xl:sticky xl:top-20 xl:row-span-2 xl:block xl:self-start">
            <SettingsNav allowed={sectionsFor(viewer.role, true).map((s) => s.id)} current="profil" />
          </aside>
          <Breadcrumb aria-label="Fil d’Ariane" className="-mb-2 hidden lg:block">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/parametres" />} className="inline-flex min-h-9 items-center gap-1 font-semibold text-link"><Icon icon={IconBack} size={16} />Paramètres</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Profil et apparence</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="min-w-0">
          <ProfileEditor user={{ id: person.id, name: person.name, avatarKey: person.avatarKey, pronouns: person.pronouns, bio: person.bio, favoriteSubjectId: person.favoriteSubjectId }} profile={profile} rarity={standing.rarity} programLabel={[person.level ? `L${person.level}` : "", programName].filter(Boolean).join(" ")}
            status={status} memberSince={memberSince} level={level} points={stats.credits} unlocked={standing.unlocked} badges={[...standing.earned]} docs={editDocs}
            subjects={subjects.map((o) => ({ id: o.id, label: oneYear ? o.name : `L${o.level} · ${o.name}` }))} lockedUntil={locked} />
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell user={viewer}>
      <div className="grid gap-8">
        <ProfileHero person={shown} profile={profile} rarity={standing.rarity} facts={facts} status={status} bio={person.bio}
          links={own || friends ? socialLinks(profile?.socials) : []} memberSince={memberSince} level={level} points={stats.credits} own={own}
          actions={<ProfileActions userId={person.id} own={own} friendship={relation} following={following} />} />

        <dl className="grid grid-cols-2 gap-4 rounded-xl bg-card p-4 shadow-xs sm:grid-cols-3 md:p-6 lg:grid-cols-5">
          {numbers.filter(([n]) => n !== null).map(([n, label]) => <div key={label}><dt className="sr-only">{label}</dt><dd><Stat value={nf.format(n!)} label={label} /></dd></div>)}
        </dl>

        <SegmentedTabs className="lg:hidden" label="Sections du profil" value={tab}
          items={TABS.map((t) => ({ value: t.value, label: t.label, href: `?onglet=${t.value}${sort === "recent" ? "&tri=recent" : ""}`, count: t.value === "badges" ? earnedCount : t.value === "cours" ? docs.length : undefined }))} />

        <div className="grid gap-8 lg:grid-cols-3 lg:gap-10">
          <div className="grid content-start gap-8 lg:col-span-2">
            {shownImpacts.length > 0 && (
              <Section tab="apercu" current={tab} title="Impact">
                <div className="grid grid-cols-2 gap-4 rounded-xl bg-card p-4 shadow-xs sm:grid-cols-4 md:p-6">
                  {shownImpacts.map(([n, label]) => <Stat key={label} value={nf.format(n!)} label={label} />)}
                </div>
              </Section>
            )}
            <Section tab="activite" current={tab} title="Activité">
              <div className="rounded-xl bg-card p-4 shadow-xs md:p-6" style={profileCardStyle(profile)}>
                <ActivityLayers summaries={[contributionText, studyText]}
                  contributions={<ActivityGraph layer={activity.contributions} scale={contributionScale} label={`Contributions : ${contributionText}`} unit={["contribution", "contributions"]} />}
                  study={studyShared ? <ActivityGraph layer={activity.study} scale={studyScale} label={`Révision : ${studyText}`} unit={["fiche ou question", "fiches ou questions"]} /> : null} />
              </div>
            </Section>
            <Section tab="cours" current={tab} title="Cours publiés"
              aside={docs.length > 1 && <SegmentedTabs label="Tri des cours" value={sort} className="mx-0 px-0" items={[{ value: "merci", label: "Plus remerciés", href: "?onglet=cours" }, { value: "recent", label: "Récents", href: "?onglet=cours&tri=recent" }]} />}>
              {ordered.length ? (
                <DocGrid>
                  {ordered.slice(0, 24).map((d) => (
                    <li key={d.id}>
                      <DocCard doc={d} meta={[showcase.includes(d.id) ? "Épinglé" : "", d.subject ?? ""].filter(Boolean).join(" · ")}
                        footer={d.thanks > 0 ? <span className="tabular-nums text-muted-foreground">{d.thanks} merci{d.thanks > 1 ? "s" : ""}</span> : undefined} />
                    </li>
                  ))}
                </DocGrid>
              ) : own ? (
                <EmptyState icon={IconAdd} title="Aucun cours publié" action={<Link href="/contribuer" className="font-semibold text-link underline-offset-2 hover:underline">Partager un cours</Link>} />
              ) : <p className="text-muted-foreground">Aucun cours publié</p>}
            </Section>
          </div>

          <div className="grid content-start gap-8">
            {trophies.length > 0 && (
              <Section tab="apercu" current={tab} title="Trophées">
                <ul className="grid gap-2">
                  {trophies.map((t) => (
                    <li key={t.name} data-rarity="legendaire" className="trophy flex items-center gap-3 rounded-xl bg-card p-3 shadow-xs">
                      <span className="flex size-10 items-center justify-center rounded-full bg-(--r-tint) text-(--r)"><Icon icon={IconTrophy} size={24} /></span>
                      <span className="min-w-0"><span className="block font-semibold">{t.name}</span><span className="text-sm text-muted-foreground">{t.detail}</span></span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            <Section tab="badges" current={tab} title="Badges" aside={<span className="text-sm tabular-nums text-muted-foreground">{earnedCount} sur {board.length}</span>}>
              {cells.length ? <BadgeBoard cells={cells} own={own} shown={profile?.badgeShown ?? null} fresh={unseen.map((u) => u.badge)} />
                : <p className="text-muted-foreground">Aucun badge pour l’instant</p>}
            </Section>
          </div>
        </div>
      </div>
    </Shell>
  );
}
