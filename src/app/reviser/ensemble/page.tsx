import { and, asc, count, desc, eq, gt, isNull, or } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { answerGroupInvite } from "@/app/actions/groups";
import { FriendQuickAdd } from "@/components/friends/friend-quick-add";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { GroupCreate } from "@/components/revise/group-create";
import { LeagueCard, ReviseTabs, Section } from "@/components/revise/revise-parts";
import { ShareStudySwitch } from "@/components/revise/today-client";
import { Shell } from "@/components/shell";
import { Submit } from "@/components/submit";
import { requireUser } from "@/lib/auth";
import { cardCounts } from "@/lib/card-counts";
import { db, schema } from "@/lib/db";
import { friendLeague, friendsOf } from "@/lib/friends";
import { IconChevronRight, IconDuel, IconNote, IconTogether } from "@/lib/icons";
import { featureOn } from "@/lib/site-settings";

export const metadata: Metadata = { title: "Réviser à plusieurs" };

const { studyGroupMembers, studyGroups, users, documents, quizDuels, quizDuelScores, revisionSpaces, revisionMembers } = schema;

const row = "flex min-h-14 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover-ok:bg-muted";

export default async function TogetherPage() {
  const user = await requireUser();
  const now = new Date();
  const [friends, ranking, duelsOn, groupsOn, cards] = await Promise.all([friendsOf(user.id), featureOn("ranking"), featureOn("duels"), featureOn("groups"), cardCounts(user.id)]);
  const [league, groups, duelsToPlay, duelsSent, spaces] = await Promise.all([
    user.prefs.hideGame ? Promise.resolve(null) : friendLeague(user, friends),
    groupsOn ? db.select({ id: studyGroups.id, name: studyGroups.name, status: studyGroupMembers.status, owner: users.name }).from(studyGroupMembers).innerJoin(studyGroups, eq(studyGroupMembers.groupId, studyGroups.id)).innerJoin(users, eq(studyGroups.ownerId, users.id)).where(eq(studyGroupMembers.userId, user.id)).orderBy(asc(studyGroups.name)) : [],
    duelsOn ? db.select({ id: quizDuels.id, title: documents.title, from: users.name }).from(quizDuels).innerJoin(documents, eq(quizDuels.documentId, documents.id)).innerJoin(users, eq(quizDuels.challengerId, users.id))
      .leftJoin(quizDuelScores, and(eq(quizDuelScores.duelId, quizDuels.id), eq(quizDuelScores.userId, user.id)))
      .where(and(eq(quizDuels.invitedId, user.id), gt(quizDuels.expiresAt, now), isNull(quizDuelScores.userId))).orderBy(desc(quizDuels.createdAt)).limit(10) : [],
    duelsOn ? db.select({ id: quizDuels.id, title: documents.title, played: count(quizDuelScores.userId) }).from(quizDuels).innerJoin(documents, eq(quizDuels.documentId, documents.id))
      .leftJoin(quizDuelScores, eq(quizDuelScores.duelId, quizDuels.id)).where(and(eq(quizDuels.challengerId, user.id), gt(quizDuels.expiresAt, now))).groupBy(quizDuels.id, documents.title).orderBy(desc(quizDuels.createdAt)).limit(5) : [],
    db.selectDistinct({ id: revisionSpaces.id, documentId: revisionSpaces.documentId, title: documents.title, ownerId: revisionSpaces.ownerId, updatedAt: revisionSpaces.updatedAt }).from(revisionSpaces).innerJoin(documents, eq(revisionSpaces.documentId, documents.id))
      .leftJoin(revisionMembers, and(eq(revisionMembers.spaceId, revisionSpaces.id), eq(revisionMembers.status, "accepted")))
      .where(and(isNull(documents.deletedAt), or(and(eq(revisionSpaces.ownerId, user.id), eq(revisionMembers.status, "accepted")), eq(revisionMembers.userId, user.id)))).orderBy(desc(revisionSpaces.updatedAt)).limit(20),
  ]);
  const invites = groups.filter((g) => g.status === "pending");
  const mine = groups.filter((g) => g.status === "accepted");
  return (
    <Shell user={user}>
      <PageHeader title="Réviser" shortTitle="Ensemble" tabs={<ReviseTabs value="together" ranking={ranking} due={cards.due} />} />
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-12">
          <section aria-label="Ajouter un ami" className="rise">
            <FriendQuickAdd code={user.friendCode} />
          </section>
          {league && (league.visible
            ? <Section title="Ligue d’amis"><div className="rounded-xl bg-card p-5 shadow-xs"><LeagueCard league={league} /></div></Section>
            : friends.length > 0 && <Section title="Ligue d’amis"><div className="rounded-xl bg-card p-5 shadow-xs">{league.iShare ? <p className="text-sm text-muted-foreground">Elle commence dès qu’un ami partage aussi</p> : <ShareStudySwitch on={false} />}</div></Section>)}
          {spaces.length > 0 && (
            <Section title="Cours annotés partagés">
              <ul className="stagger grid gap-1">{spaces.map((space) => <li key={space.id}><Link href={`/d/${space.documentId}${space.ownerId === user.id ? "" : `?revision=${space.id}`}`} className={row}><Icon icon={IconNote} className="text-muted-foreground" /><span className="min-w-0 flex-1 truncate font-semibold">{space.title || "Sans titre"}</span><span className="text-sm text-muted-foreground">{space.ownerId === user.id ? "tes notes" : "partagé avec toi"}</span></Link></li>)}</ul>
            </Section>
          )}
        </div>
        <div className="grid content-start gap-12">
          {duelsOn && (
            <Section title="Défis en cours" label="Défis" className="scroll-mt-24" >
              <span id="defis" className="sr-only" />
              {duelsToPlay.length + duelsSent.length > 0 ? (
                <ul className="stagger grid gap-1">
                  {duelsToPlay.map((duel) => <li key={duel.id}><Link href={`/defi/${duel.id}`} className={row}><Icon icon={IconDuel} className="text-brand-text" /><span className="grid min-w-0 flex-1"><span className="truncate font-semibold">{duel.title}</span><span className="text-sm text-brand-text">{duel.from} te défie</span></span><Icon icon={IconChevronRight} size={16} className="text-muted-foreground" /></Link></li>)}
                  {duelsSent.map((duel) => <li key={duel.id}><Link href={`/defi/${duel.id}`} className={row}><Icon icon={IconDuel} className="text-muted-foreground" /><span className="grid min-w-0 flex-1"><span className="truncate font-semibold">{duel.title}</span><span className="text-sm text-muted-foreground">{duel.played ? `${duel.played} ${duel.played > 1 ? "parties jouées" : "partie jouée"}` : "pas encore joué"}</span></span><Icon icon={IconChevronRight} size={16} className="text-muted-foreground" /></Link></li>)}
                </ul>
              ) : <p className="text-sm text-muted-foreground">Fais un quiz, puis défie un ami avec ton score</p>}
            </Section>
          )}
          {groupsOn && (
            <Section title="Groupes" action={<GroupCreate friends={friends.map((f) => ({ id: f.id, name: f.name, avatarKey: f.avatarKey }))} />}>
              {invites.length > 0 && (
                <ul aria-label="Invitations à un groupe" className="grid gap-2">
                  {invites.map((invite) => (
                    <li key={invite.id} className="rise flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card p-3 shadow-xs">
                      <span className="min-w-0 text-sm"><span className="font-semibold">{invite.owner}</span> t’invite dans <span className="font-semibold">{invite.name}</span></span>
                      <form action={answerGroupInvite} className="flex gap-1.5"><input type="hidden" name="group" value={invite.id} /><Submit size="sm" variant="outline" name="answer" value="accept">Rejoindre</Submit><Submit size="sm" variant="ghost" name="answer" value="refuse">Refuser</Submit></form>
                    </li>
                  ))}
                </ul>
              )}
              {mine.length > 0
                ? <ul className="stagger grid gap-1">{mine.map((group) => <li key={group.id}><Link href={`/groupes/${group.id}`} className={row}><Icon icon={IconTogether} className="text-muted-foreground" /><span className="min-w-0 flex-1 truncate font-semibold">{group.name}</span><Icon icon={IconChevronRight} size={16} className="text-muted-foreground" /></Link></li>)}</ul>
                : !invites.length && <p className="text-sm text-muted-foreground">Un minuteur commun et des rendez-vous, entre amis</p>}
            </Section>
          )}
        </div>
      </div>
    </Shell>
  );
}
