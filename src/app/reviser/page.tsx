import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { answerRevisionInvite } from "@/app/actions/revision";
import { EmptyState } from "@/components/empty-state";
import { FriendQuickAdd } from "@/components/friends/friend-quick-add";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { CardsEntry, HeatMap, LeagueCard, Modes, QuestList, ReadinessBars, ReviseTabs, Section, TodayCard } from "@/components/revise/revise-parts";
import { ExamPaperList, PromoPackList } from "@/components/revise/resources";
import { GamePills, GameStatus, GoalPicker, ShareStudySwitch } from "@/components/revise/today-client";
import { Shell } from "@/components/shell";
import { Submit } from "@/components/submit";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { friendLeague, friendsOf } from "@/lib/friends";
import { dueTomorrow, gameSnapshot, questsOf, subjectScores, weeklyQuestDays } from "@/lib/habits";
import { cardCounts } from "@/lib/card-counts";
import { examPapersForMe, promoPacks } from "@/lib/revise-resources";
import { IconCards, IconFriends, IconTogether } from "@/lib/icons";
import { featureOn } from "@/lib/site-settings";
import { todayPlan } from "@/lib/today-plan";

export const metadata: Metadata = { title: "Réviser" };

const { revisionMembers, revisionSpaces, documents, users } = schema;

export default async function ReviewPage() {
  const user = await requireUser();
  const playGame = !user.prefs.hideGame;
  const [plan, cards, scores, invites, ranking, duels, friends, packs, papers] = await Promise.all([
    todayPlan(user),
    cardCounts(user.id),
    subjectScores(user),
    db.select({ space: revisionSpaces.id, title: documents.title, owner: users.name }).from(revisionMembers).innerJoin(revisionSpaces, eq(revisionMembers.spaceId, revisionSpaces.id)).innerJoin(documents, eq(revisionSpaces.documentId, documents.id)).innerJoin(users, eq(revisionSpaces.ownerId, users.id)).where(and(eq(revisionMembers.userId, user.id), eq(revisionMembers.status, "pending"))),
    featureOn("ranking"),
    featureOn("duels"),
    friendsOf(user.id),
    promoPacks(user, 3),
    examPapersForMe(user, 3),
  ]);
  const [game, tomorrow, quests, fullDays, league] = playGame
    ? await Promise.all([gameSnapshot(user.id), dueTomorrow(user.id), questsOf(user), weeklyQuestDays(user.id), friendLeague(user, friends)])
    : [null, 0, [], 0, null];
  const empty = cards.total === 0 && plan.kind !== "cards" && plan.kind !== "exam";
  return (
    <Shell user={user}>
      <PageHeader title="Réviser" tabs={<ReviseTabs value="today" ranking={ranking} due={cards.due} />} />
      {invites.length > 0 && (
        <section aria-label="Invitations à réviser" className="rise mb-8 grid gap-2 rounded-xl bg-card p-4 shadow-xs">
          {invites.map((invite) => (
            <div key={invite.space} className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 text-sm"><span className="font-semibold">{invite.owner}</span> t’invite à réviser <span className="font-semibold">{invite.title}</span></span>
              <form action={answerRevisionInvite} className="flex gap-1.5"><input type="hidden" name="space" value={invite.space} /><Submit size="sm" variant="outline" name="answer" value="accept">Accepter</Submit><Submit size="sm" variant="ghost" name="answer" value="refuse">Refuser</Submit></form>
            </div>
          ))}
        </section>
      )}
      <div className="grid gap-10 pb-28 md:pb-8 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-12">
        <div className="contents xl:grid xl:content-start xl:gap-12">
          {game && <div className="order-1 md:hidden"><GamePills game={game} tomorrow={tomorrow} /></div>}
          <div className="order-2">
            {empty
              ? <EmptyState icon={IconCards} title="Tes fiches arrivent des cours que tu lis" description="Choisis un cours : Campuss IA les écrit, ou fais-les toi-même" action={<Link href="/reviser/fiches/nouveau" className={buttonVariants()}>Créer mes fiches</Link>} />
              : <TodayCard plan={plan} />}
          </div>
          {!empty && <div className="order-2"><CardsEntry total={cards.total} due={cards.due} /></div>}
          <Section title="Modes" className="order-4"><Modes duels={duels} /></Section>
          {/* Paquets et sujets publiés sont des ressources pour réviser, pas des cours */}
          {packs.length > 0 && <Section title="Paquets de la promo" className="order-4" action={<Link href="/reviser/fiches/paquets" className="text-sm text-link hover:underline">Tout voir</Link>}><PromoPackList rows={packs} /></Section>}
          {papers.length > 0 && <Section title="Sujets de partiels pour s’entraîner" className="order-4" action={<Link href="/reviser/partiels#sujets" className="text-sm text-link hover:underline">Tout voir</Link>}><ExamPaperList papers={papers} /></Section>}
          {scores.length > 0 && <Section title="Préparation par matière" className="order-5" action={<Link href="/reviser/partiels" className="text-sm text-link hover:underline">Partiels</Link>}><ReadinessBars rows={scores} /></Section>}
          {game && <Section title="Régularité" className="order-6"><HeatMap heat={game.heat} goal={game.goal} /></Section>}
          <div className="order-7 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link href="/parametres/revision" className="inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground">Réglages de révision</Link>
          </div>
        </div>
        <aside aria-label="Progrès et amis" className="order-3 grid content-start gap-6 md:grid-cols-2 xl:sticky xl:top-6 xl:order-none xl:grid-cols-1 xl:self-start">
          {game && (
            <section aria-label="Objectif et série" className="hidden gap-5 rounded-xl bg-card p-5 shadow-xs md:grid">
              <GameStatus game={game} tomorrow={tomorrow} />
              <GoalPicker goal={game.goal} />
            </section>
          )}
          {game && quests.length > 0 && <Section title="Quêtes du jour" className="rounded-xl bg-card p-5 shadow-xs"><QuestList quests={quests} fullDays={fullDays} /></Section>}
          {league && (league.visible
            ? <Section title="Ligue d’amis" className="rounded-xl bg-card p-5 shadow-xs" action={<Link href="/reviser/ensemble" className="text-sm text-link hover:underline">Tout voir</Link>}><LeagueCard league={league} compact /></Section>
            : friends.length > 0 && <Section title="Ligue d’amis" className="rounded-xl bg-card p-5 shadow-xs">{league.iShare ? <p className="text-sm text-muted-foreground">Elle commence dès qu’un ami partage aussi</p> : <ShareStudySwitch on={false} />}</Section>)}
          <Section title={<span className="flex items-center gap-2"><Icon icon={IconTogether} className="text-muted-foreground" />Réviser à plusieurs</span>} label="Réviser à plusieurs" className="rounded-xl bg-card p-5 shadow-xs">
            <FriendQuickAdd code={user.friendCode} compact />
            {friends.length > 0 && <Link href="/reviser/ensemble" className="inline-flex items-center gap-2 text-sm text-link hover:underline"><Icon icon={IconFriends} size={16} />{friends.length} {friends.length > 1 ? "amis" : "ami"}</Link>}
          </Section>
        </aside>
      </div>
    </Shell>
  );
}
