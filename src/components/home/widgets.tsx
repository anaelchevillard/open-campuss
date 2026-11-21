import "server-only";
import { and, asc, count, eq, gte, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import type { ReactNode } from "react";
import { examShort } from "@/lib/exam-kind";
import { FriendQuickAdd } from "@/components/friends/friend-quick-add";
import { Icon } from "@/components/icon";
import { Stat } from "@/components/stat";
import { aiAvailable } from "@/lib/ai-available";
import { db, schema } from "@/lib/db";
import type { requireUser } from "@/lib/auth";
import { friendsOf, privacyOf, studyingNow } from "@/lib/friends";
import { HOME_WIDGETS, visibleHomeWidgets, type HomeWidgetId } from "@/lib/home-widgets";
import { IconAi, IconChevronRight, IconFavorite, IconFriends, IconStreak } from "@/lib/icons";
import { shortName } from "@/lib/user-name-rules";
import { HomeWidgetsEditor } from "./widgets-editor";

const { documents, documentRatings, exams, favorites, subjects } = schema;
const DAY = 86_400_000;

async function upcomingExams(programId: number, level: number) {
  const now = new Date();
  const rows = await db.select({ id: exams.id, at: exams.at, kind: exams.kind, subject: subjects.shortName, name: subjects.name }).from(exams).innerJoin(subjects, eq(exams.subjectId, subjects.id))
    .where(and(eq(subjects.programId, programId), eq(subjects.level, level), gte(exams.at, now))).orderBy(asc(exams.at)).limit(3);
  return rows.map((r) => ({ ...r, days: Math.max(0, Math.ceil((r.at.getTime() - now.getTime()) / DAY)) }));
}

/** Étoiles (favoris) et notes reçues sur les cours que j'ai publiés. */
async function received(userId: string) {
  const mine = and(eq(documents.createdBy, userId), eq(documents.published, true), isNull(documents.deletedAt));
  const [[docs], [stars], [ratings]] = await Promise.all([
    db.select({ n: count() }).from(documents).where(mine),
    db.select({ n: count() }).from(favorites).innerJoin(documents, eq(favorites.documentId, documents.id)).where(mine),
    db.select({ n: count(), avg: sql<number | null>`avg(${documentRatings.stars})::float8` }).from(documentRatings).innerJoin(documents, eq(documentRatings.documentId, documents.id)).where(mine),
  ]);
  return { docs: docs.n, stars: stars.n, ratings: ratings.n, average: ratings.avg };
}

/** Amis en train de réviser : seulement ceux qui l'ont permis (Confidentialité › « Montrer quand je révise »). */
async function friendsStudying(userId: string) {
  const friends = await friendsOf(userId);
  if (!friends.length) return { friends: 0, now: [] as string[] };
  const ids = friends.map((f) => f.id);
  const studying = await studyingNow(ids, await privacyOf(ids));
  return { friends: friends.length, now: friends.filter((f) => studying.has(f.id)).map((f) => shortName(f.name)) };
}

function Card({ title, children, href }: { title: string; children: ReactNode; href?: string }) {
  return (
    <section aria-label={title} className="grid gap-2 rounded-xl bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
        {href && <Link href={href} className="-m-1 rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label={`Ouvrir : ${title}`}><Icon icon={IconChevronRight} size={16} /></Link>}
      </div>
      {children}
    </section>
  );
}

/** Zone de widgets sous les sélecteurs, sur ordinateur seulement : le téléphone garde son accueil. */
export async function HomeWidgets({ user, programId, level, streak }: { user: Awaited<ReturnType<typeof requireUser>>; programId: number; level: number; streak: number | null }) {
  const pref = user.prefs.homeWidgets;
  const shown = visibleHomeWidgets(pref);
  const want = (id: HomeWidgetId) => shown.includes(id);
  const [examList, likes, studying, ai] = await Promise.all([
    want("exams") ? upcomingExams(programId, level) : [],
    want("likes") ? received(user.id) : null,
    want("friends") ? friendsStudying(user.id) : null,
    want("ai") ? aiAvailable() : false,
  ]);

  const render: Record<HomeWidgetId, () => ReactNode> = {
    exams: () => (
      <Card title="Partiels et CC à venir" href="/reviser/partiels">
        {examList.length
          ? <ul className="grid gap-1.5">{examList.map((e) => <li key={e.id} className="flex items-baseline gap-3"><span className="w-14 shrink-0 font-semibold tabular-nums text-brand-text">{e.days ? `J−${e.days}` : "Auj."}</span><span className="min-w-0 truncate">{e.subject || e.name}</span><span className="ml-auto shrink-0 text-xs text-muted-foreground">{examShort(e.kind)}</span></li>)}</ul>
          : <p className="text-sm text-muted-foreground">Aucun partiel ni CC annoncé pour l’instant</p>}
      </Card>
    ),
    likes: () => likes && likes.docs > 0 ? (
      <Card title="Mes cours" href="/contribuer">
        <div className="flex items-center gap-3">
          <Icon icon={IconFavorite} size={24} className="text-warning" />
          <Stat value={likes.stars} label={likes.stars > 1 ? "étoiles reçues" : "étoile reçue"} />
        </div>
        {likes.ratings > 0 && likes.average !== null && <p className="text-sm text-muted-foreground tabular-nums">{likes.average.toFixed(1).replace(".", ",")}/5 sur {likes.ratings} avis</p>}
      </Card>
    ) : null,
    code: () => (
      <Card title="Code ami" href="/amis">
        <FriendQuickAdd code={user.friendCode} compact />
      </Card>
    ),
    streak: () => streak !== null ? (
      <Card title="Régularité" href="/reviser">
        <div className="flex items-center gap-3">
          <Icon icon={IconStreak} size={24} className={streak > 0 ? "text-warning" : "text-muted-foreground"} />
          <Stat value={streak} label={streak > 1 ? "jours de suite" : "jour de suite"} />
        </div>
      </Card>
    ) : null,
    friends: () => studying && studying.friends > 0 ? (
      <Card title="Amis en train de réviser" href="/amis">
        {studying.now.length
          ? <ul className="flex flex-wrap gap-1.5">{studying.now.map((name) => <li key={name} className="flex items-center gap-1.5 rounded-full bg-brand-tint px-2.5 py-0.5 text-sm font-semibold text-brand-text"><Icon icon={IconFriends} size={16} />{name}</li>)}</ul>
          : <p className="text-sm text-muted-foreground">Personne en ce moment</p>}
      </Card>
    ) : null,
    ai: () => ai ? (
      <Card title="Campuss IA">
        <Link href="/reviser/seance?mode=partiel" className="flex min-h-11 items-center gap-3 rounded-lg px-1 transition-colors hover-ok:bg-muted">
          <Icon icon={IconAi} className="text-brand-text" />
          <span className="min-w-0 flex-1"><span className="block font-semibold">Partiel blanc</span><span className="block text-sm text-muted-foreground">Questions générées pour ton prochain partiel</span></span>
        </Link>
      </Card>
    ) : null,
  };

  return (
    <div className="hidden content-start gap-4 lg:grid">
      {shown.map((id) => <div key={id} className="contents">{render[id]()}</div>)}
      <HomeWidgetsEditor widgets={HOME_WIDGETS.map((w) => ({ id: w.id, label: w.label }))} pref={pref ?? null} />
    </div>
  );
}
