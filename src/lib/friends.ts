import "server-only";
import { and, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { readableDocuments } from "./access";
import { db, schema } from "./db";
import { profilesOf } from "./profile-data";
import type { ProfilePrivacy, User } from "./db/schema";
import { BADGES } from "./gamification";
import { leagueOf, leagueVisible } from "./league";
import { computeStreak, parisDay, weekOf } from "./study-habits";

const { friendships, users, userBlocks, userProfiles } = schema;

/** Les comptes bloqués dans un sens ou dans l'autre : ils sortent de toute liste. */
export async function blockedWith(userId: string) {
  const rows = await db.select({ a: userBlocks.blockerId, b: userBlocks.blockedId }).from(userBlocks).where(or(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, userId)));
  return new Set(rows.map((row) => (row.a === userId ? row.b : row.a)));
}

/** Les amis confirmés : la seule liste de personnes qu'un étudiant voit pour réviser ou coécrire. Jamais un compte bloqué. */
export async function friendsOf(userId: string) {
  const rows = await db.select({ requesterId: friendships.requesterId, addresseeId: friendships.addresseeId }).from(friendships)
    .where(and(eq(friendships.status, "accepted"), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))));
  const blocked = rows.length ? await blockedWith(userId) : new Set<string>();
  const ids = rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId)).filter((id) => !blocked.has(id));
  if (!ids.length) return [];
  const people = await db.select({ id: users.id, name: users.name, avatarKey: users.avatarKey, role: users.role, programId: users.programId, level: users.level, status: users.status }).from(users).where(inArray(users.id, ids));
  return people.filter((p) => p.status === "active").sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export type Friend = Awaited<ReturnType<typeof friendsOf>>[number];

export async function areFriends(a: string, b: string) {
  const [row] = await db.select({ status: friendships.status }).from(friendships)
    .where(and(eq(friendships.status, "accepted"), or(and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)), and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)))));
  return Boolean(row) && !(await isBlockedBetween(a, b));
}

/** Un blocage, dans un sens ou dans l'autre : aucune demande, aucun nom, aucune activité ne passe. */
export async function isBlockedBetween(a: string, b: string) {
  const [row] = await db.select({ at: userBlocks.at }).from(userBlocks)
    .where(or(and(eq(userBlocks.blockerId, a), eq(userBlocks.blockedId, b)), and(eq(userBlocks.blockerId, b), eq(userBlocks.blockedId, a)))).limit(1);
  return Boolean(row);
}

/** Confidentialité de révision, prudente par défaut : rien n'est partagé sans un choix explicite. */
export async function privacyOf(ids: string[]) {
  const rows = ids.length ? await db.select({ id: userProfiles.userId, privacy: userProfiles.privacy }).from(userProfiles).where(inArray(userProfiles.userId, ids)) : [];
  const map = new Map<string, ProfilePrivacy>(rows.map((row) => [row.id, row.privacy ?? {}]));
  return (id: string): ProfilePrivacy => map.get(id) ?? {};
}

const STUDYING_MS = 10 * 60_000;

/** « En train de réviser » : une fiche notée depuis moins de 10 minutes, seulement pour qui l'a permis. */
export async function studyingNow(ids: string[], privacy: (id: string) => ProfilePrivacy) {
  const allowed = ids.filter((id) => privacy(id).showStudying);
  if (!allowed.length) return new Set<string>();
  const rows = await db.selectDistinct({ id: schema.cardReviews.userId }).from(schema.cardReviews).where(and(inArray(schema.cardReviews.userId, allowed), gte(schema.cardReviews.at, new Date(Date.now() - STUDYING_MS))));
  return new Set(rows.map((row) => row.id));
}

/** Ligue de la semaine entre amis qui partagent leur révision. Nulle si je ne partage pas, ou personne d'autre. */
export async function friendLeague(me: Pick<User, "id" | "name">, friends: Friend[]) {
  const privacy = await privacyOf([me.id, ...friends.map((f) => f.id)]);
  const sharing = friends.filter((f) => privacy(f.id).shareStudy);
  if (!leagueVisible(Boolean(privacy(me.id).shareStudy), sharing.length)) return { visible: false as const, iShare: Boolean(privacy(me.id).shareStudy) };
  const monday = weekOf(parisDay(new Date()));
  const members = [{ id: me.id, name: me.name }, ...sharing];
  const rows = await db.select({ id: schema.studyDays.userId, day: schema.studyDays.day, xp: schema.studyDays.xp, cards: schema.studyDays.cards, questions: schema.studyDays.questions }).from(schema.studyDays)
    .where(and(inArray(schema.studyDays.userId, members.map((m) => m.id)), gte(schema.studyDays.day, monday)));
  const league = leagueOf(members.map((m) => {
    const mine = rows.filter((row) => row.id === m.id);
    return { id: m.id, name: m.name, me: m.id === me.id, xp: mine.reduce((s, r) => s + r.xp, 0), cards: mine.reduce((s, r) => s + r.cards + r.questions, 0) };
  }));
  const avatars = new Map(friends.map((f) => [f.id, f.avatarKey]));
  // Le nom riche de chacun (police, couleur, badge) dans la ligue
  const profiles = await profilesOf(league.rows.map((row) => row.id));
  return { visible: true as const, iShare: true, ...league, rows: league.rows.map((row) => ({ ...row, avatarKey: row.me ? null : avatars.get(row.id) ?? null, profile: profiles.get(row.id) ?? null })) };
}

export type ActivityEvent = { key: string; userId: string; text: string; detail?: string; href?: string; when: "today" | "week" | "earlier"; at: number };

const whenOf = (at: Date) => {
  const days = (Date.now() - at.getTime()) / 86_400_000;
  return parisDay(at) === parisDay(new Date()) ? "today" as const : days < 7 ? "week" as const : "earlier" as const;
};

/**
 * L'activité des amis, calculée (pas de table d'événements) : publications et badges toujours, révision seulement
 * pour qui la partage. Jamais d'heure précise : « aujourd'hui », « cette semaine ».
 */
export async function friendActivity(me: Pick<User, "id" | "role" | "programId">, friends: Friend[], limit = 30): Promise<ActivityEvent[]> {
  if (!friends.length) return [];
  const ids = friends.map((f) => f.id);
  const since = new Date(Date.now() - 21 * 86_400_000);
  const privacy = await privacyOf(ids);
  const sharing = ids.filter((id) => privacy(id).shareStudy);
  const [published, badges, mocks, days] = await Promise.all([
    db.select({ id: schema.documents.id, title: schema.documents.title, userId: schema.documents.createdBy, at: schema.documents.publishedAt }).from(schema.documents)
      .where(and(inArray(schema.documents.createdBy, ids), eq(schema.documents.published, true), eq(schema.documents.hiddenByReports, false), isNull(schema.documents.deletedAt), gte(schema.documents.publishedAt, since), readableDocuments(me)))
      .orderBy(desc(schema.documents.publishedAt)).limit(20),
    db.select({ userId: schema.userBadges.userId, badge: schema.userBadges.badge, at: schema.userBadges.earnedAt }).from(schema.userBadges)
      .where(and(inArray(schema.userBadges.userId, ids), isNull(schema.userBadges.revokedAt), gte(schema.userBadges.earnedAt, since))).limit(20),
    sharing.length ? db.select({ id: schema.quizAttempts.id, userId: schema.quizAttempts.userId, at: schema.quizAttempts.at, subject: schema.subjects.shortName, subjectName: schema.subjects.name }).from(schema.quizAttempts)
      .innerJoin(schema.documents, eq(schema.quizAttempts.documentId, schema.documents.id)).leftJoin(schema.subjects, eq(schema.documents.subjectId, schema.subjects.id))
      .where(and(inArray(schema.quizAttempts.userId, sharing), eq(schema.quizAttempts.mode, "mock"), gte(schema.quizAttempts.at, since))).orderBy(desc(schema.quizAttempts.at)).limit(20) : [],
    sharing.length ? db.select({ userId: schema.studyDays.userId, day: schema.studyDays.day }).from(schema.studyDays).where(inArray(schema.studyDays.userId, sharing)) : [],
  ]);
  const name = (id: string) => friends.find((f) => f.id === id)?.name ?? "";
  const events: ActivityEvent[] = [];
  for (const doc of published) if (doc.userId && doc.at) events.push({ key: `pub:${doc.id}`, userId: doc.userId, text: `${name(doc.userId)} a publié`, detail: doc.title || "Sans titre", href: `/d/${doc.id}`, when: whenOf(doc.at), at: doc.at.getTime() });
  for (const badge of badges) {
    const known = BADGES.find((b) => b.id === badge.badge);
    if (known) events.push({ key: `badge:${badge.userId.slice(0, 18)}:${badge.badge}`, userId: badge.userId, text: `${name(badge.userId)} a obtenu un badge`, detail: known.name, when: whenOf(badge.at), at: badge.at.getTime() });
  }
  // Un partiel blanc fini par jour et par personne suffit
  const seen = new Set<string>();
  for (const mock of mocks) {
    const day = `${mock.userId}:${parisDay(mock.at)}`;
    if (seen.has(day)) continue;
    seen.add(day);
    events.push({ key: `mock:${mock.id}`, userId: mock.userId, text: `${name(mock.userId)} a fini un partiel blanc`, detail: mock.subject || mock.subjectName || undefined, when: whenOf(mock.at), at: mock.at.getTime() });
  }
  const today = parisDay(new Date());
  for (const id of sharing) {
    const { streak } = computeStreak(days.filter((d) => d.userId === id).map((d) => d.day), today);
    const milestone = [100, 60, 30].find((n) => streak >= n);
    if (milestone) events.push({ key: `streak:${id.slice(0, 18)}:${milestone}`, userId: id, text: `${name(id)} : série de ${milestone} jours`, when: "week", at: Date.now() - 86_400_000 });
  }
  return events.sort((a, b) => b.at - a.at).slice(0, limit);
}

/** Les réactions sur une liste d'événements : combien, et la mienne. */
export async function reactionsOn(meId: string, keys: string[]) {
  if (!keys.length) return new Map<string, { count: number; mine: string | null }>();
  const rows = await db.select({ key: schema.friendReactions.eventKey, actor: schema.friendReactions.actorId, kind: schema.friendReactions.kind }).from(schema.friendReactions).where(inArray(schema.friendReactions.eventKey, keys));
  const map = new Map<string, { count: number; mine: string | null }>();
  for (const row of rows) {
    const entry = map.get(row.key) ?? { count: 0, mine: null };
    entry.count++;
    if (row.actor === meId) entry.mine = row.kind;
    map.set(row.key, entry);
  }
  return map;
}

/** Les matières communes avec un ami : même licence et même année. */
export async function sharedSubjects(me: Pick<User, "programId" | "level">, friend: Pick<Friend, "programId" | "level">) {
  if (!me.programId || me.programId !== friend.programId || (me.level ?? 1) !== (friend.level ?? 1)) return [];
  return db.select({ id: schema.subjects.id, name: schema.subjects.shortName }).from(schema.subjects).where(and(eq(schema.subjects.programId, me.programId), eq(schema.subjects.level, me.level ?? 1))).limit(6);
}
