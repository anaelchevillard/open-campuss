import { namer } from "@/lib/user-name";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { ActivityFeed, BlockedList, FriendList, FriendsBoard, InviteAccept, InviteLink, RequestList, type BoardTab } from "@/components/friends/friends-board";
import { FollowList } from "@/components/friends/follow-list";
import { FriendQuickAdd } from "@/components/friends/friend-quick-add";
import { CopyLink } from "@/components/habits";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/revise/revise-parts";
import { Shell } from "@/components/shell";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { readableDocuments } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { friendActivity, friendsOf, privacyOf, reactionsOn, studyingNow } from "@/lib/friends";
import { CREDITS_PER_REFERRAL } from "@/lib/gamification";
import { IconChevronRight, IconDuel, IconInvite, IconTogether } from "@/lib/icons";
import { followsOf } from "@/lib/people";
import { inviteCodeOf, referralCount } from "@/lib/referrals";
import { profilesOf } from "@/lib/profile-data";
import { featureOn } from "@/lib/site-settings";
import { computeStreak, parisDay } from "@/lib/study-habits";
import Link from "next/link";

export const metadata: Metadata = { title: "Amis" };

const { friendships, users } = schema;
const TABS: BoardTab[] = ["amis", "activite", "demandes", "abonnements"];
const row = "flex min-h-14 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover-ok:bg-muted";

export default async function FriendsPage({ searchParams }: PageProps<"/amis">) {
  const user = await requireUser();
  const params = await searchParams;
  const friends = await friendsOf(user.id);
  const ids = friends.map((f) => f.id);
  const [requests, privacy, activity, inviteCode, invited, blocked, courses, duelsOn, groupsOn, mySubjects, follows, levelSubjects] = await Promise.all([
    db.select({ id: users.id, name: users.name, avatarKey: users.avatarKey, context: friendships.context }).from(friendships).innerJoin(users, eq(friendships.requesterId, users.id)).where(and(eq(friendships.addresseeId, user.id), eq(friendships.status, "pending"), eq(users.status, "active"))),
    privacyOf(ids),
    friendActivity(user, friends),
    inviteCodeOf(user.id),
    referralCount(user.id),
    db.select({ id: users.id, name: users.name }).from(schema.userBlocks).innerJoin(users, eq(schema.userBlocks.blockedId, users.id)).where(eq(schema.userBlocks.blockerId, user.id)),
    db.select({ id: schema.documents.id, title: schema.documents.title }).from(schema.readingProgress).innerJoin(schema.documents, eq(schema.readingProgress.documentId, schema.documents.id))
      .where(and(eq(schema.readingProgress.userId, user.id), readableDocuments(user), isNull(schema.documents.deletedAt), eq(schema.documents.published, true))).orderBy(desc(schema.readingProgress.updatedAt)).limit(8),
    featureOn("duels"), featureOn("groups"),
    user.programId ? db.select({ name: schema.subjects.shortName, full: schema.subjects.name }).from(schema.subjects).where(and(eq(schema.subjects.programId, user.programId), eq(schema.subjects.level, user.level ?? 1))).limit(4) : Promise.resolve([]),
    followsOf(user),
    // Les matières de son année, à suivre en un geste depuis l'onglet Abonnements
    user.programId ? db.select({ id: schema.subjects.id, name: schema.subjects.name }).from(schema.subjects).where(and(eq(schema.subjects.programId, user.programId), eq(schema.subjects.level, user.level ?? 1))).orderBy(asc(schema.subjects.name)).limit(30) : Promise.resolve([]),
  ]);
  const [studying, days, reactions, duels, groups] = await Promise.all([
    studyingNow(ids, privacy),
    ids.filter((id) => privacy(id).shareStudy).length ? db.select({ id: schema.studyDays.userId, day: schema.studyDays.day }).from(schema.studyDays).where(inArray(schema.studyDays.userId, ids.filter((id) => privacy(id).shareStudy))) : Promise.resolve([]),
    reactionsOn(user.id, activity.map((e) => e.key)),
    duelsOn ? db.select({ id: schema.quizDuels.id, title: schema.documents.title, from: users.name }).from(schema.quizDuels).innerJoin(schema.documents, eq(schema.quizDuels.documentId, schema.documents.id)).innerJoin(users, eq(schema.quizDuels.challengerId, users.id)).where(eq(schema.quizDuels.invitedId, user.id)).orderBy(desc(schema.quizDuels.createdAt)).limit(5) : Promise.resolve([]),
    groupsOn ? db.select({ id: schema.studyGroups.id, name: schema.studyGroups.name }).from(schema.studyGroupMembers).innerJoin(schema.studyGroups, eq(schema.studyGroupMembers.groupId, schema.studyGroups.id)).where(and(eq(schema.studyGroupMembers.userId, user.id), eq(schema.studyGroupMembers.status, "accepted"))).limit(8) : Promise.resolve([]),
  ]);
  // Les groupes cités dans une demande : « pour rejoindre TD civil »
  const nameOf = await namer(user);
  const contextGroups = requests.flatMap((r) => (r.context?.kind === "group" ? [r.context.id] : []));
  const groupNames = contextGroups.length ? await db.select({ id: schema.studyGroups.id, name: schema.studyGroups.name }).from(schema.studyGroups).where(inArray(schema.studyGroups.id, contextGroups)) : [];
  const today = parisDay(new Date());
  const profiles = await profilesOf([...ids, ...requests.map((r) => r.id)]);
  const board = friends.map((f) => ({
    profile: profiles.get(f.id) ?? null,
    id: f.id, name: f.name, avatarKey: f.avatarKey, studying: studying.has(f.id),
    streak: privacy(f.id).shareStudy ? computeStreak(days.filter((d) => d.id === f.id).map((d) => d.day), today).streak : null,
    subjects: f.programId === user.programId && (f.level ?? 1) === (user.level ?? 1) ? mySubjects.map((s) => s.name || s.full) : [],
  }));
  const code = typeof params.code === "string" ? params.code : undefined;
  const token = typeof params.lien === "string" ? params.lien : undefined;
  return (
    <Shell user={user}>
      <PageHeader title="Amis" />
      {token && <div className="mb-8 max-w-xl"><InviteAccept token={token} /></div>}
      <FriendsBoard
        requestCount={requests.length}
        requests={<section aria-label="Demandes reçues" className="grid gap-3"><h2 className="heading">Demandes</h2><RequestList requests={requests.map((r) => ({ id: r.id, name: nameOf(r), avatarKey: r.avatarKey, profile: profiles.get(r.id) ?? null, context: r.context?.kind === "group" ? `pour rejoindre ${groupNames.find((g) => g.id === r.context!.id)?.name ?? "un groupe"}` : r.context?.kind === "duel" ? "pour un défi" : r.context?.kind === "revision" ? "pour réviser un cours" : null }))} /></section>}
        initialTab={TABS.find((t) => t === params.onglet)}
        friends={
          <Section title={`${friends.length} ${friends.length > 1 ? "amis" : "ami"}`} label="Mes amis">
            <FriendList friends={board} courses={courses} />
          </Section>
        }
        follows={<FollowList people={follows.people} subjects={follows.subjects} suggestions={levelSubjects} />}
        aside={
          <>
            <FriendQuickAdd code={user.friendCode} initial={code} />
            <InviteLink />
            <Accordion className="rounded-xl bg-card px-4 shadow-xs">
              <AccordionItem value="campuss">
                <AccordionTrigger><span className="flex items-center gap-2"><Icon icon={IconInvite} className="text-muted-foreground" />Inviter sur Campuss</span></AccordionTrigger>
                <AccordionContent className="grid gap-3">
                  <p className="text-sm text-muted-foreground">{CREDITS_PER_REFERRAL} crédits pour toi à l’activation de son compte{invited > 0 ? ` · ${invited} ${invited > 1 ? "personnes ont" : "personne a"} déjà rejoint` : ""}</p>
                  <CopyLink link={`${env.baseUrl}/register?ref=${inviteCode}`} />
                </AccordionContent>
              </AccordionItem>
              {blocked.length > 0 && (
                <AccordionItem value="bloques">
                  <AccordionTrigger>{blocked.length} {blocked.length > 1 ? "comptes bloqués" : "compte bloqué"}</AccordionTrigger>
                  <AccordionContent><BlockedList people={blocked.map((b) => ({ ...b, name: nameOf(b) }))} /></AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
          </>
        }
        activity={
          <>
            <Section title="Activité"><ActivityFeed events={activity.map((e) => ({ ...e, count: reactions.get(e.key)?.count ?? 0, mine: reactions.get(e.key)?.mine ?? null }))} friends={friends.map((f) => ({ id: f.id, name: f.name, avatarKey: f.avatarKey }))} /></Section>
            {duels.length > 0 && (
              <Section title="Défis en cours">
                <ul className="grid gap-1">{duels.map((d) => <li key={d.id}><Link href={`/defi/${d.id}`} className={row}><Icon icon={IconDuel} className="text-brand-text" /><span className="grid min-w-0 flex-1"><span className="truncate font-semibold">{d.title}</span><span className="text-sm text-muted-foreground">{d.from} te défie</span></span><Icon icon={IconChevronRight} size={16} className="text-muted-foreground" /></Link></li>)}</ul>
              </Section>
            )}
            {groups.length > 0 && (
              <Section title="Groupes" action={<Link href="/reviser/ensemble" className="text-sm text-link hover:underline">Ensemble</Link>}>
                <ul className="grid gap-1">{groups.map((g) => <li key={g.id}><Link href={`/groupes/${g.id}`} className={row}><Icon icon={IconTogether} className="text-muted-foreground" /><span className="min-w-0 flex-1 truncate font-semibold">{g.name}</span><Icon icon={IconChevronRight} size={16} className="text-muted-foreground" /></Link></li>)}</ul>
              </Section>
            )}
          </>
        }
      />
    </Shell>
  );
}
