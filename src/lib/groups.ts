import "server-only";
import { and, asc, eq, gt, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";

const { studyGroupMeetings, studyGroupMembers, studyGroupSessions, studyGroups, subjects, users } = schema;

export const MAX_GROUP_MEMBERS = 12;
export const MAX_GROUPS = 20;
export const SESSION_MINUTES = [15, 25, 50] as const;

/** Le groupe et la place de la personne dedans. Rien pour qui n'y est pas : pas de différence avec un groupe inexistant. */
export async function groupAccess(rawId: unknown, userId: string) {
  const parsed = z.uuid().safeParse(rawId);
  if (!parsed.success) return null;
  const [row] = await db.select({ group: studyGroups, status: studyGroupMembers.status }).from(studyGroupMembers).innerJoin(studyGroups, eq(studyGroupMembers.groupId, studyGroups.id)).where(and(eq(studyGroupMembers.groupId, parsed.data), eq(studyGroupMembers.userId, userId)));
  return row ? { ...row, owner: row.group.ownerId === userId, member: row.status === "accepted" } : null;
}

export const acceptedMembers = (groupId: string) => db.select({ id: users.id, name: users.name, avatarKey: users.avatarKey }).from(studyGroupMembers).innerJoin(users, eq(studyGroupMembers.userId, users.id)).where(and(eq(studyGroupMembers.groupId, groupId), eq(studyGroupMembers.status, "accepted"), eq(users.status, "active"))).orderBy(asc(users.name));

export async function runningSession(groupId: string) {
  const [session] = await db.select().from(studyGroupSessions).where(and(eq(studyGroupSessions.groupId, groupId), gt(studyGroupSessions.endsAt, new Date()))).limit(1);
  return session ?? null;
}

/** L'heure de référence du décompte, envoyée au navigateur avec la session. */
export const serverClock = () => Date.now();

/** Les rendez-vous à venir de ses groupes, et d'aucun autre : c'est tout ce que le calendrier en montre. */
export async function myMeetings(userId: string) {
  const groups = await db.select({ id: studyGroupMembers.groupId }).from(studyGroupMembers).where(and(eq(studyGroupMembers.userId, userId), eq(studyGroupMembers.status, "accepted")));
  if (!groups.length) return [];
  return db.select({ id: studyGroupMeetings.id, at: studyGroupMeetings.at, groupId: studyGroups.id, group: studyGroups.name, subject: subjects.name }).from(studyGroupMeetings)
    .innerJoin(studyGroups, eq(studyGroupMeetings.groupId, studyGroups.id)).leftJoin(subjects, eq(studyGroupMeetings.subjectId, subjects.id))
    .where(and(inArray(studyGroupMeetings.groupId, groups.map((g) => g.id)), gte(studyGroupMeetings.at, new Date()))).orderBy(asc(studyGroupMeetings.at)).limit(20);
}
