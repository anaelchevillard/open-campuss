"use server";

import { and, count, eq, gt, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/action-form";
import { requireUser } from "@/lib/auth";
import { subjectOptions } from "@/lib/catalog";
import { db, schema } from "@/lib/db";
import { areFriends } from "@/lib/friends";
import { acceptedMembers, groupAccess, MAX_GROUP_MEMBERS, MAX_GROUPS, runningSession, SESSION_MINUTES } from "@/lib/groups";
import { notify } from "@/lib/notify";
import { rateHit, rateLimited } from "@/lib/security";
import { forgetShellCounters } from "@/lib/shell-cache";
import { parisLocalToDate } from "@/lib/study-habits";

const { studyGroupMeetings, studyGroupMembers, studyGroups, studyGroupSessions } = schema;

const field = (form: FormData, name: string, max = 200) => { const value = form.get(name); return typeof value === "string" ? value.trim().slice(0, max) : ""; };
const refresh = (groupId?: string) => { revalidatePath("/reviser/ensemble"); if (groupId) revalidatePath(`/groupes/${groupId}`); };

async function asMember(form: FormData) {
  const user = await requireUser();
  const access = await groupAccess(form.get("group"), user.id);
  if (!access?.member) throw new Error("accès refusé");
  return { user, ...access };
}

async function asOwner(form: FormData) {
  const context = await asMember(form);
  if (!context.owner) throw new Error("accès refusé");
  return context;
}

async function others(groupId: string, userId: string) {
  return (await acceptedMembers(groupId)).filter((member) => member.id !== userId);
}

export async function createGroup(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = field(form, "name", 60).split(/\s+/).join(" ");
  if (name.length < 2) return { error: "Donne un nom au groupe." };
  const [mine] = await db.select({ n: count() }).from(studyGroups).where(eq(studyGroups.ownerId, user.id));
  if (mine.n >= MAX_GROUPS) return { error: "Tu as déjà beaucoup de groupes. Supprime-en un d’abord." };
  const key = `group-create:${user.id}`;
  if (await rateLimited(key, 10, 1440)) return { error: "Trop de groupes créés aujourd’hui. Réessaie demain." };
  await rateHit(key);
  const id = await db.transaction(async (tx) => {
    const [group] = await tx.insert(studyGroups).values({ name, ownerId: user.id }).returning({ id: studyGroups.id });
    await tx.insert(studyGroupMembers).values({ groupId: group.id, userId: user.id, status: "accepted" });
    return group.id;
  });
  // Créé depuis une sélection d'amis : chacun reçoit son invitation, seulement s'il est bien un ami
  const picked = [...new Set(form.getAll("members").map(String))].filter((v) => z.uuid().safeParse(v).success).slice(0, MAX_GROUP_MEMBERS - 1);
  for (const other of picked) {
    if (other === user.id || !(await areFriends(user.id, other))) continue;
    const [invited] = await db.insert(studyGroupMembers).values({ groupId: id, userId: other }).onConflictDoNothing().returning();
    if (!invited) continue;
    forgetShellCounters(other);
    await notify(other, { kind: "group", title: `${user.name} t’invite à réviser ensemble`, body: name, href: "/reviser/ensemble" });
  }
  redirect(`/groupes/${id}`);
}

/** Seul le créateur invite, et seulement ses amis : un membre ne fait jamais entrer un inconnu des autres sans lui. */
export async function inviteToGroup(form: FormData) {
  const { user, group } = await asOwner(form);
  const other = z.uuid().parse(form.get("user"));
  if (other === user.id || !(await areFriends(user.id, other))) return;
  const key = `group-invite:${user.id}`;
  if (await rateLimited(key, 40, 1440)) return;
  const [size] = await db.select({ n: count() }).from(studyGroupMembers).where(and(eq(studyGroupMembers.groupId, group.id), ne(studyGroupMembers.status, "refused")));
  if (size.n >= MAX_GROUP_MEMBERS) return;
  const [invited] = await db.insert(studyGroupMembers).values({ groupId: group.id, userId: other }).onConflictDoNothing().returning();
  if (!invited) return;
  await rateHit(key);
  forgetShellCounters(other);
  await notify(other, { kind: "group", title: `${user.name} t’invite à réviser ensemble`, body: group.name, href: "/reviser/ensemble" });
  refresh(group.id);
}

export async function answerGroupInvite(form: FormData) {
  const user = await requireUser();
  const groupId = z.uuid().parse(form.get("group"));
  const status = form.get("answer") === "accept" ? "accepted" as const : "refused" as const;
  await db.update(studyGroupMembers).set({ status }).where(and(eq(studyGroupMembers.groupId, groupId), eq(studyGroupMembers.userId, user.id), eq(studyGroupMembers.status, "pending")));
  forgetShellCounters(user.id);
  refresh(groupId);
  if (status === "accepted") redirect(`/groupes/${groupId}`);
}

export async function leaveGroup(form: FormData) {
  const { user, group, owner } = await asMember(form);
  if (owner) return;
  await db.delete(studyGroupMembers).where(and(eq(studyGroupMembers.groupId, group.id), eq(studyGroupMembers.userId, user.id)));
  refresh(group.id);
  redirect("/reviser/ensemble");
}

export async function removeFromGroup(form: FormData) {
  const { user, group } = await asOwner(form);
  const other = z.uuid().parse(form.get("user"));
  if (other === user.id) return;
  await db.delete(studyGroupMembers).where(and(eq(studyGroupMembers.groupId, group.id), eq(studyGroupMembers.userId, other)));
  forgetShellCounters(other);
  refresh(group.id);
}

export async function deleteGroup(form: FormData) {
  const { group } = await asOwner(form);
  const pending = await db.select({ id: studyGroupMembers.userId }).from(studyGroupMembers).where(and(eq(studyGroupMembers.groupId, group.id), eq(studyGroupMembers.status, "pending")));
  await db.delete(studyGroups).where(eq(studyGroups.id, group.id));
  forgetShellCounters(...pending.map((row) => row.id));
  refresh();
  redirect("/reviser/ensemble");
}

export async function startGroupSession(form: FormData) {
  const { user, group } = await asMember(form);
  const minutes = Number(form.get("minutes"));
  if (!(SESSION_MINUTES as readonly number[]).includes(minutes)) return;
  const key = `group-session:${user.id}`;
  if (await rateLimited(key, 30, 1440)) return;
  if (await runningSession(group.id)) { refresh(group.id); return; }
  await rateHit(key);
  const startsAt = new Date();
  await db.insert(studyGroupSessions).values({ groupId: group.id, startedBy: user.id, startsAt, endsAt: new Date(startsAt.getTime() + minutes * 60_000) });
  for (const member of await others(group.id, user.id)) await notify(member.id, { kind: "group", title: `${group.name} : session de ${minutes} minutes`, body: `${user.name} vient de lancer le minuteur.`, href: `/groupes/${group.id}` });
  refresh(group.id);
}

export async function stopGroupSession(form: FormData) {
  const { group } = await asMember(form);
  const now = new Date();
  await db.update(studyGroupSessions).set({ endsAt: now }).where(and(eq(studyGroupSessions.groupId, group.id), gt(studyGroupSessions.endsAt, now)));
  refresh(group.id);
}

export async function createMeeting(_: FormState, form: FormData): Promise<FormState> {
  const { user, group } = await asMember(form);
  const at = parisLocalToDate(field(form, "at", 20));
  if (!at) return { error: "Choisis une date et une heure." };
  if (at.getTime() < Date.now()) return { error: "Cette date est déjà passée." };
  if (at.getTime() > Date.now() + 366 * 86_400_000) return { error: "Choisis une date dans l’année qui vient." };
  const rawSubject = field(form, "subject", 9);
  let subjectId: number | null = null;
  if (rawSubject) {
    const subject = (await subjectOptions(user)).find((option) => option.id === Number(rawSubject));
    if (!subject) return { error: "Choisis une matière de ta licence." };
    subjectId = subject.id;
  }
  const key = `group-meeting:${user.id}`;
  if (await rateLimited(key, 30, 1440)) return { error: "Trop de rendez-vous aujourd’hui. Réessaie demain." };
  await rateHit(key);
  await db.insert(studyGroupMeetings).values({ groupId: group.id, at, subjectId, createdBy: user.id });
  const when = at.toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  for (const member of await others(group.id, user.id)) await notify(member.id, { kind: "group", title: `${group.name} : nouveau rendez-vous`, body: when, href: "/reviser/partiels" });
  refresh(group.id);
  revalidatePath("/reviser/partiels");
  return { ok: "Rendez-vous ajouté au calendrier du groupe." };
}

export async function deleteMeeting(form: FormData) {
  const { user, group, owner } = await asMember(form);
  const id = z.uuid().parse(form.get("meeting"));
  await db.delete(studyGroupMeetings).where(and(eq(studyGroupMeetings.id, id), eq(studyGroupMeetings.groupId, group.id), owner ? undefined : eq(studyGroupMeetings.createdBy, user.id)));
  refresh(group.id);
  revalidatePath("/reviser/partiels");
}
