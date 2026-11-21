import { UserName } from "@/components/user-name";
import { profilesOf } from "@/lib/profile-data";
import { namer } from "@/lib/user-name";
import { and, asc, eq, gte } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createMeeting, deleteGroup, deleteMeeting, inviteToGroup, leaveGroup, removeFromGroup, startGroupSession, stopGroupSession } from "@/app/actions/groups";
import { ActionForm, ConfirmForm } from "@/components/action-form";
import { Avatar } from "@/components/avatar";
import { FriendQuickAdd } from "@/components/friends/friend-quick-add";
import { Field } from "@/components/field";
import { SubjectPicker } from "@/components/subject-picker";
import { GroupTimer, LiveRefresh } from "@/components/habits";
import { Badge } from "@/components/reui/badge";
import { PageHead, Shell } from "@/components/shell";
import { Submit } from "@/components/submit";
import { requireUser } from "@/lib/auth";
import { subjectOptions } from "@/lib/catalog";
import { db, schema } from "@/lib/db";
import { formatDateTime } from "@/lib/documents";
import { friendsOf } from "@/lib/friends";
import { groupAccess, runningSession, serverClock, SESSION_MINUTES } from "@/lib/groups";

export const metadata: Metadata = { title: "Groupe de révision" };

const { studyGroupMeetings, studyGroupMembers, subjects, users } = schema;

export default async function GroupPage({ params }: PageProps<"/groupes/[id]">) {
  const user = await requireUser();
  const access = await groupAccess((await params).id, user.id);
  if (!access || access.status === "refused") notFound();
  // Une invitation ne montre pas encore les membres : elle se décide sur la liste des groupes
  if (!access.member) redirect("/reviser/ensemble");
  const { group, owner } = access;
  const [members, session, meetings, friends, options] = await Promise.all([
    db.select({ id: users.id, name: users.name, avatarKey: users.avatarKey, status: studyGroupMembers.status }).from(studyGroupMembers).innerJoin(users, eq(studyGroupMembers.userId, users.id)).where(eq(studyGroupMembers.groupId, group.id)).orderBy(asc(users.name)),
    runningSession(group.id),
    db.select({ id: studyGroupMeetings.id, at: studyGroupMeetings.at, createdBy: studyGroupMeetings.createdBy, subject: subjects.name }).from(studyGroupMeetings).leftJoin(subjects, eq(studyGroupMeetings.subjectId, subjects.id)).where(and(eq(studyGroupMeetings.groupId, group.id), gte(studyGroupMeetings.at, new Date()))).orderBy(asc(studyGroupMeetings.at)),
    owner ? friendsOf(user.id) : [],
    subjectOptions(user),
  ]);
  // Seul le créateur voit qui a été invité ou a refusé
  const [nameOf, memberProfiles] = await Promise.all([namer(user), profilesOf(members.map((m) => m.id))]);
  const visible = members.filter((member) => owner || member.status === "accepted").map((member) => ({ ...member, name: nameOf(member) }));
  const candidates = friends.filter((friend) => !members.some((member) => member.id === friend.id));
  const groupField = <input type="hidden" name="group" value={group.id} />;
  return (
    <Shell user={user}>
      <LiveRefresh />
      <p className="mb-3 text-sm"><Link className="text-muted-foreground hover:text-foreground" href="/reviser/ensemble">Ensemble</Link></p>
      <PageHead title={group.name} />
      <div className="grid max-w-3xl gap-10">
        <section aria-label="Minuteur partagé" className="rounded-xl bg-card shadow-xs p-5">
          {session ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div><p className="text-sm text-muted-foreground">Session en cours, pour tout le groupe</p><GroupTimer endsAt={session.endsAt.getTime()} serverNow={serverClock()} /></div>
              <form action={stopGroupSession}>{groupField}<Submit variant="outline">Arrêter</Submit></form>
            </div>
          ) : (
            <>
              <h2 className="heading">Lancer une session</h2>
              <p className="mt-1 text-sm text-muted-foreground">Tout le groupe voit le même décompte.</p>
              <form action={startGroupSession} className="mt-3 flex flex-wrap gap-2">{groupField}{SESSION_MINUTES.map((minutes) => <Submit key={minutes} name="minutes" value={String(minutes)} variant={minutes === 25 ? "default" : "outline"}>{minutes} min</Submit>)}</form>
            </>
          )}
        </section>
        <section>
          <h2 className="heading mb-2">Rendez-vous</h2>
          {meetings.length > 0 && (
            <ul className="line-list mb-4">
              {meetings.map((meeting) => (
                <li key={meeting.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="min-w-0 font-semibold">{formatDateTime(meeting.at)}{meeting.subject && <span className="font-normal text-muted-foreground">, {meeting.subject}</span>}</span>
                  {(owner || meeting.createdBy === user.id) && <form action={deleteMeeting}>{groupField}<input type="hidden" name="meeting" value={meeting.id} /><Submit size="sm" variant="ghost">Annuler</Submit></form>}
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={createMeeting} className="grid max-w-md gap-3">
            {groupField}
            <Field label="Date et heure" name="at" type="datetime-local" required />
            {options.length > 0 && (
              <SubjectPicker subjects={options} id="subject" name="subject" placeholder="Aucune" level={user.level ?? undefined}
                label={<>Matière<span className="font-normal text-muted-foreground"> (facultatif)</span></>} />
            )}
            <div><Submit variant="outline">Ajouter le rendez-vous</Submit></div>
          </ActionForm>
        </section>
        <section>
          <h2 className="heading mb-2">Membres</h2>
          <ul className="line-list">
            {visible.map((member) => (
              <li key={member.id} className="flex items-center gap-3 py-2.5">
                <Avatar user={member} size={32} /><span className="min-w-0 flex-1 font-semibold wrap-break-word"><UserName user={member} profile={memberProfiles.get(member.id)} self={member.id === user.id} />{member.id === group.ownerId && <span className="font-normal text-muted-foreground">, a créé le groupe</span>}</span>
                {member.status !== "accepted" && <Badge variant={member.status === "pending" ? "warning-light" : "secondary"} size="sm">{member.status === "pending" ? "en attente" : "refusé"}</Badge>}
                {owner && member.id !== user.id && <form action={removeFromGroup}>{groupField}<input type="hidden" name="user" value={member.id} /><Submit size="sm" variant="ghost" aria-label={`Retirer ${member.name}`}>Retirer</Submit></form>}
              </li>
            ))}
          </ul>
          {owner && (candidates.length > 0 ? (
            <div className="mt-5">
              <h3 className="mb-1 font-semibold">Inviter un ami</h3>
              <ul className="line-list">
                {candidates.map((friend) => (
                  <li key={friend.id}><form action={inviteToGroup} className="flex items-center gap-3 py-2">{groupField}<input type="hidden" name="user" value={friend.id} /><Avatar user={friend} size={28} /><span className="min-w-0 flex-1 wrap-break-word">{friend.name}</span><Submit size="sm" variant="outline" aria-label={`Inviter ${friend.name}`}>Inviter</Submit></form></li>
                ))}
              </ul>
            </div>
          ) : null)}
          {owner && <FriendQuickAdd code={user.friendCode} context={{ kind: "group", id: group.id }} contextLabel={`Dès qu’il accepte, il rejoint ${group.name}`} className="mt-5" />}
        </section>
        {owner
          ? <ConfirmForm action={deleteGroup} confirm="Le groupe et ses rendez-vous seront supprimés.">{groupField}<Submit size="sm" variant="ghost">Supprimer le groupe</Submit></ConfirmForm>
          : <ConfirmForm action={leaveGroup} confirm="Tu ne verras plus ses rendez-vous.">{groupField}<Submit size="sm" variant="ghost">Quitter le groupe</Submit></ConfirmForm>}
      </div>
    </Shell>
  );
}
