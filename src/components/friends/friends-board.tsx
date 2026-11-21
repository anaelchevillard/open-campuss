"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "motion/react";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { cn } from "cn";
import { answerFriendRequest, blockUser, createFriendInvite, reactTo, removeFriendById, sendCourse, unblockUser, acceptFriendInvite } from "@/app/actions/friends";
import { Avatar } from "@/components/avatar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PeopleSearch } from "@/components/friends/people-search";
import { Icon } from "@/components/icon";
import { ResponsiveMenu } from "@/components/responsive-menu";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { Button, buttonVariants } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { UserName } from "@/components/user-name";
import type { UserProfile } from "@/lib/db/schema";
import { useCoarsePointer } from "@/hooks/use-media";
import { IconBlock, IconCopy, IconDuel, IconLink, IconMore, IconQr, IconRemoveFriend, IconSend, IconStreak, IconTogether } from "@/lib/icons";
import { sheet } from "@/lib/motion";
import { toast, toastError } from "@/lib/toast";

export type BoardFriend = { id: string; name: string; avatarKey: string | null; studying: boolean; streak: number | null; subjects: string[]; profile?: UserProfile | null };
export type BoardRequest = { id: string; name: string; avatarKey: string | null; context: string | null; profile?: UserProfile | null };
export type BoardEvent = { key: string; userId: string; text: string; detail?: string; href?: string; when: "today" | "week" | "earlier"; count: number; mine: string | null };

const WHEN = { today: "Aujourd’hui", week: "Cette semaine", earlier: "Plus tôt" };
const REACTIONS = [{ kind: "bravo", label: "Bravo" }, { kind: "merci", label: "Merci" }, { kind: "courage", label: "Courage" }] as const;

export type BoardTab = "amis" | "activite" | "demandes" | "abonnements";

/**
 * Page Amis façon réseau social : la recherche en tête, puis quatre onglets ; sur ordinateur, ajout par code et
 * invitations dans une colonne à droite. Une recherche en cours remplace les onglets.
 */
export function FriendsBoard({ friends, activity, requests, follows, aside, requestCount, initialTab }: { friends: ReactNode; activity: ReactNode; requests: ReactNode; follows: ReactNode; aside: ReactNode; requestCount: number; initialTab?: BoardTab }) {
  const [tab, setTab] = useState<BoardTab>(initialTab ?? (requestCount ? "demandes" : "amis"));
  const [searching, setSearching] = useState(false);
  const panes: Record<BoardTab, ReactNode> = { amis: friends, activite: activity, demandes: requests, abonnements: follows };
  return (
    <div className="grid grid-cols-1 gap-6">
      <PeopleSearch onActive={setSearching} />
      <div className={cn("grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]", searching && "hidden")}>
        <div className="grid min-w-0 grid-cols-1 content-start gap-6">
          <SegmentedTabs label="Amis" value={tab} onValueChange={(value) => setTab(value as BoardTab)} items={[
            { value: "amis", label: "Amis" }, { value: "activite", label: "Activité" }, { value: "demandes", label: "Demandes", count: requestCount }, { value: "abonnements", label: "Abonnements" },
          ]} />
          <div className="grid min-w-0 grid-cols-1 content-start gap-10">{panes[tab]}</div>
        </div>
        <aside aria-label="Ajouter et inviter" className={cn("grid content-start gap-6", tab !== "amis" && "hidden lg:grid")}>{aside}</aside>
      </div>
    </div>
  );
}

/** Demandes reçues : accepter ou refuser sur place ; au téléphone, glisser à droite accepte (les boutons restent). */
export function RequestList({ requests }: { requests: BoardRequest[] }) {
  const [gone, setGone] = useState<string[]>([]);
  const [, start] = useTransition();
  const router = useRouter();
  const answer = (id: string, accept: boolean) => {
    setGone((all) => [...all, id]);
    start(async () => { await answerFriendRequest(id, accept); if (accept) toast("Vous êtes amis"); router.refresh(); });
  };
  const shown = requests.filter((r) => !gone.includes(r.id));
  if (!shown.length) return <p className="text-sm text-muted-foreground">Aucune demande en attente</p>;
  return (
    <ul className="grid gap-2" aria-label="Demandes reçues">
      <AnimatePresence initial={false}>
        {shown.map((request) => <RequestRow key={request.id} request={request} onAnswer={answer} />)}
      </AnimatePresence>
    </ul>
  );
}

function RequestRow({ request, onAnswer }: { request: BoardRequest; onAnswer: (id: string, accept: boolean) => void }) {
  const coarse = useCoarsePointer();
  const reduce = useReducedMotion();
  const end = (_: unknown, info: PanInfo) => { if (info.offset.x > 120 || info.velocity.x > 500) onAnswer(request.id, true); };
  return (
    <motion.li layout={!reduce} initial={{ opacity: 0, y: reduce ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: reduce ? 0 : 60, transition: { duration: 0.2 } }}
      drag={coarse && !reduce ? "x" : false} dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0, right: 0.5 }} onDragEnd={end} transition={sheet} style={{ touchAction: "pan-y" }}
      className="flex flex-wrap items-center gap-3 rounded-xl bg-card p-3 shadow-xs">
      <Link href={`/u/${request.id}`} className="shrink-0" aria-hidden tabIndex={-1}><Avatar user={request} size={40} /></Link>
      <span className="grid min-w-0 flex-1"><Link href={`/u/${request.id}`} className="truncate hover:underline"><UserName user={request} profile={request.profile} variant="rich" className="truncate" /></Link>{request.context && <span className="truncate text-xs text-muted-foreground">{request.context}</span>}</span>
      <span className="flex gap-1.5">
        <Button size="sm" variant="outline" onClick={() => onAnswer(request.id, true)}>Accepter</Button>
        <Button size="sm" variant="ghost" onClick={() => onAnswer(request.id, false)}>Refuser</Button>
      </span>
    </motion.li>
  );
}

/** La liste d'amis : nom vers le profil, fiche au survol (ordinateur), menu « … ». */
export function FriendList({ friends, courses }: { friends: BoardFriend[]; courses: { id: string; title: string }[] }) {
  const [removed, setRemoved] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<{ friend: BoardFriend; kind: "remove" | "block" } | null>(null);
  const [sendTo, setSendTo] = useState<BoardFriend | null>(null);
  const coarse = useCoarsePointer();
  const router = useRouter();
  const shown = friends.filter((f) => !removed.includes(f.id));
  if (!shown.length) return <p className="text-sm text-muted-foreground">Donne ton code : dès qu’un ami l’ajoute, il apparaît ici</p>;
  const act = async () => {
    if (!confirm) return;
    setRemoved((all) => [...all, confirm.friend.id]);
    if (confirm.kind === "block") await blockUser(confirm.friend.id); else await removeFriendById(confirm.friend.id);
    toast(confirm.kind === "block" ? `${confirm.friend.name} est bloqué` : `${confirm.friend.name} retiré de tes amis`);
    setConfirm(null);
    router.refresh();
  };
  return (
    <>
      <ul className="grid gap-1" aria-label="Mes amis">
        {shown.map((friend) => {
          const who = (
            <span className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className="relative"><Avatar user={friend} size={40} />{friend.studying && <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-[var(--success)] ring-2 ring-background" aria-hidden />}</span>
              <span className="grid min-w-0"><UserName user={friend} profile={friend.profile} list className="truncate font-semibold" /><span className="truncate text-xs text-muted-foreground">{friend.studying ? "En train de réviser" : friend.streak ? `Série de ${friend.streak} j` : friend.subjects.length ? "Même année" : "Ami"}</span></span>
            </span>
          );
          return (
            <li key={friend.id} className="flex min-h-14 items-center gap-2 rounded-lg px-2 transition-colors hover-ok:bg-muted">
              {coarse
                ? <Link href={`/u/${friend.id}`} className="flex min-w-0 flex-1">{who}</Link>
                : (
                  <HoverCard>
                    <HoverCardTrigger render={<Link href={`/u/${friend.id}`} className="flex min-w-0 flex-1" />}>{who}</HoverCardTrigger>
                    <HoverCardContent side="right" align="start" className="w-72 p-4"><FriendCard friend={friend} onSend={() => setSendTo(friend)} /></HoverCardContent>
                  </HoverCard>
                )}
              <ResponsiveMenu title={friend.name} trigger={<Button variant="ghost" size="icon" aria-label={`Actions pour ${friend.name}`}><Icon icon={IconMore} /></Button>} items={[
                { label: "Défier", icon: IconDuel, href: "/reviser/ensemble#defis" },
                { label: "Envoyer un cours", icon: IconSend, onSelect: () => setSendTo(friend) },
                { label: "Retirer", icon: IconRemoveFriend, onSelect: () => setConfirm({ friend, kind: "remove" }), separatorBefore: true },
                { label: "Bloquer", icon: IconBlock, danger: true, onSelect: () => setConfirm({ friend, kind: "block" }) },
              ]} />
            </li>
          );
        })}
      </ul>
      <ResponsiveSheet open={Boolean(sendTo)} onOpenChange={(open) => !open && setSendTo(null)} title={`Envoyer un cours à ${sendTo?.name ?? ""}`}>
        {courses.length ? (
          <ul className="grid gap-1 pb-4">
            {courses.map((course) => (
              <li key={course.id}>
                <button type="button" className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-muted" onClick={async () => {
                  const result = await sendCourse(sendTo!.id, course.id);
                  if ("ok" in result) toast(result.ok); else toastError(result.error);
                  setSendTo(null);
                }}><Icon icon={IconSend} className="text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{course.title || "Sans titre"}</span></button>
              </li>
            ))}
          </ul>
        ) : <p className="pb-4 text-sm text-muted-foreground">Les cours que tu lis apparaîtront ici</p>}
      </ResponsiveSheet>
      <ConfirmDialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.kind === "block" ? `Bloquer ${confirm.friend.name} ?` : `Retirer ${confirm?.friend.name ?? ""} ?`}
        description={confirm?.kind === "block" ? "Vous ne verrez plus vos profils ni vos activités, et aucun de vous deux ne pourra inviter l’autre" : "Vos groupes communs, défis et révisions partagées s’arrêtent"}
        confirmLabel={confirm?.kind === "block" ? "Bloquer" : "Retirer"} level={confirm?.kind === "block" ? "danger" : "simple"} onConfirm={act} />
    </>
  );
}

/** Fiche ami : avatar, nom riche, série si partagée, matières communes, trois actions. */
function FriendCard({ friend, onSend }: { friend: BoardFriend; onSend: () => void }) {
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <Avatar user={friend} size={56} />
        <div className="grid min-w-0 gap-0.5">
          <Link href={`/u/${friend.id}`} className="hover:underline"><UserName user={friend} profile={friend.profile} variant="rich" showBadge className="text-lg" /></Link>
          {friend.studying && <span className="text-sm text-success-foreground">En train de réviser</span>}
          {friend.streak !== null && friend.streak > 0 && <span className="flex items-center gap-1 text-sm text-muted-foreground"><Icon icon={IconStreak} size={16} className="text-brand-text" filled />{friend.streak} {friend.streak > 1 ? "jours" : "jour"} de série</span>}
        </div>
      </div>
      {friend.subjects.length > 0 && <ul className="flex flex-wrap gap-1.5" aria-label="Matières communes">{friend.subjects.map((s) => <li key={s} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">{s}</li>)}</ul>}
      <div className="grid grid-cols-3 gap-2">
        <Link href="/reviser/ensemble#defis" data-slot="button" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "flex-col gap-1 py-2")}><Icon icon={IconDuel} size={16} />Défier</Link>
        <Link href="/reviser/ensemble" data-slot="button" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "flex-col gap-1 py-2")}><Icon icon={IconTogether} size={16} />Ensemble</Link>
        <Button variant="outline" size="sm" className="flex-col gap-1 py-2" onClick={onSend}><Icon icon={IconSend} size={16} />Un cours</Button>
      </div>
    </div>
  );
}

/** Le texte d'un événement, le nom de l'ami en lien vers son profil. */
function EventText({ text, friend }: { text: string; friend?: { id: string; name: string } }) {
  if (!friend || !text.startsWith(friend.name)) return <span className="font-semibold">{text}</span>;
  return <span className="font-semibold"><Link href={`/u/${friend.id}`} className="hover:underline">{friend.name}</Link>{text.slice(friend.name.length)}</span>;
}

/** L'activité des amis : trois réactions fixes, pas de texte libre, jamais d'heure précise. */
export function ActivityFeed({ events, friends }: { events: BoardEvent[]; friends: { id: string; name: string; avatarKey: string | null }[] }) {
  const [state, setState] = useState(() => Object.fromEntries(events.map((e) => [e.key, { count: e.count, mine: e.mine }])));
  if (!events.length) return <p className="text-sm text-muted-foreground">Rien de neuf chez tes amis cette semaine</p>;
  const groups = (["today", "week", "earlier"] as const).map((when) => ({ when, items: events.filter((e) => e.when === when) })).filter((g) => g.items.length);
  const react = async (event: BoardEvent, kind: (typeof REACTIONS)[number]["kind"]) => {
    const before = state[event.key];
    const toggled = before.mine === kind;
    setState((all) => ({ ...all, [event.key]: { count: before.count + (toggled ? -1 : before.mine ? 0 : 1), mine: toggled ? null : kind } }));
    try { await reactTo(event.userId, event.key, kind); } catch { setState((all) => ({ ...all, [event.key]: before })); }
  };
  return (
    <div className="grid gap-6">
      {groups.map((group) => (
        <div key={group.when} className="grid gap-2">
          <h3 className="text-xs font-semibold text-muted-foreground">{WHEN[group.when]}</h3>
          <ul className="grid gap-2">
            {group.items.map((event) => {
              const friend = friends.find((f) => f.id === event.userId);
              const s = state[event.key];
              return (
                <li key={event.key} className="grid gap-3 rounded-xl bg-card p-4 shadow-xs">
                  <div className="flex items-start gap-3">
                    {friend && <Link href={`/u/${friend.id}`} aria-hidden tabIndex={-1} className="shrink-0"><Avatar user={friend} size={32} /></Link>}
                    <p className="min-w-0 flex-1 text-sm"><EventText text={event.text} friend={friend} />{event.detail && <> · {event.href ? <Link href={event.href} className="text-link hover:underline">{event.detail}</Link> : event.detail}</>}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Réagir">
                    {REACTIONS.map((r) => (
                      <button key={r.kind} type="button" aria-pressed={s.mine === r.kind} onClick={() => void react(event, r.kind)}
                        className={cn("min-h-8 rounded-full px-3 text-xs font-semibold transition-colors coarse:min-h-10 motion-ok:active:scale-95", s.mine === r.kind ? "bg-brand-tint text-brand-text" : "bg-muted text-muted-foreground hover:text-foreground")}>
                        {r.label}
                      </button>
                    ))}
                    {s.count > 0 && <span className="ml-1 text-xs text-muted-foreground tabular-nums">{s.count} {s.count > 1 ? "réactions" : "réaction"}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Lien d'ami qui expire (7 jours, 5 usages), avec son QR, pour un groupe de discussion. */
export function InviteLink() {
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const make = () => start(async () => {
    const result = await createFriendInvite();
    if ("error" in result) { toastError(result.error); return; }
    setLink(result);
    const QR = await import("qrcode");
    setQr(await QR.toDataURL(result.url, { margin: 1, width: 200 }));
  });
  return (
    <div className="grid gap-3">
      {!link ? (
        <Button variant="ghost" className="justify-start" pending={pending} onClick={make}><Icon icon={IconLink} size={16} />Créer un lien d’invitation</Button>
      ) : (
        <div className="rise grid gap-3 rounded-xl bg-card p-4 shadow-xs">
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 text-xs">{link.url}</code>
            <Button variant="ghost" size="icon" aria-label="Copier le lien" onClick={async () => { await navigator.clipboard?.writeText(link.url).catch(() => undefined); toast("Lien copié"); }}><Icon icon={IconCopy} /></Button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt="QR du lien d’invitation" width={160} height={160} className="justify-self-center rounded-lg bg-white p-2" />}
          <p className="flex items-center gap-1 text-xs text-muted-foreground"><Icon icon={IconQr} size={16} />5 usages · jusqu’au {new Date(link.expiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</p>
        </div>
      )}
    </div>
  );
}

/** Arrivée par le lien (ou le QR code) d'un ami : l'amitié est faite dès l'ouverture, sans validation. */
export function InviteAccept({ token }: { token: string }) {
  const [state, setState] = useState<{ ok?: string; error?: string } | null>(null);
  const router = useRouter();
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void acceptFriendInvite(token).then((result) => { setState(result ?? null); router.refresh(); }, () => setState({ error: "Le lien n’a pas pu être utilisé, réessaie" }));
  }, [token, router]);
  if (state?.ok) return <p role="status" className="rise rounded-xl bg-success-tint p-4 text-sm font-semibold text-success-foreground">{state.ok}</p>;
  return (
    <p role="status" className="rise rounded-xl bg-card p-4 text-sm shadow-sm">{state?.error ?? "Ajout de ton ami…"}</p>
  );
}

export function BlockedList({ people }: { people: { id: string; name: string }[] }) {
  const [gone, setGone] = useState<string[]>([]);
  const shown = people.filter((p) => !gone.includes(p.id));
  if (!shown.length) return <p className="text-sm text-muted-foreground">Personne</p>;
  return (
    <ul className="grid gap-1">
      {shown.map((person) => (
        <li key={person.id} className="flex min-h-11 items-center justify-between gap-3">
          <span className="truncate text-sm">{person.name}</span>
          <Button size="sm" variant="ghost" onClick={async () => { setGone((all) => [...all, person.id]); await unblockUser(person.id); toast(`${person.name} débloqué`); }}>Débloquer</Button>
        </li>
      ))}
    </ul>
  );
}
