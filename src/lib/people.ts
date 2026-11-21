import "server-only";
import { and, asc, eq, ilike, inArray, ne, notInArray, or, sql } from "drizzle-orm";
import { escapeLike } from "./content-utils";
import { db, schema } from "./db";
import type { User, UserProfile } from "./db/schema";
import { blockedWith, privacyOf } from "./friends";
import { matchesShownName, relationOf, SEARCH_LIMIT, type Relation } from "./people-rules";
import { canSeeProfile } from "./profile-access";
import { profilesOf } from "./profile-data";
import { namer } from "./user-name";

const { friendships, profileFollows, programs, subjectFollows, subjects, userProfiles, users } = schema;

type Viewer = Pick<User, "id" | "role" | "programId">;
type Target = Pick<User, "id" | "role" | "programId" | "status">;

/** Une amitié ou une demande en cours entre deux personnes, dans un sens ou dans l'autre. */
async function linkBetween(a: string, b: string) {
  const [row] = await db.select({ requesterId: friendships.requesterId, status: friendships.status }).from(friendships)
    .where(or(and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)), and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)))).limit(1);
  return row;
}

/**
 * Profil visible : la règle de licence, plus, sur tout Campuss, les amis, les demandes en cours
 * et les personnes qui se laissent trouver par leur nom. Le blocage reste vérifié à part.
 */
export async function canViewProfile(viewer: Viewer, target: Target) {
  if (canSeeProfile(viewer, target)) return true;
  if (target.status !== "active") return false;
  const link = await linkBetween(viewer.id, target.id);
  if (link && link.status !== "refused") return true;
  return (await privacyOf([target.id]))(target.id).findable !== false;
}

export type PersonResult = { id: string; name: string; avatarKey: string | null; profile: UserProfile | null; program: string | null; relation: Relation };

/** Recherche par nom : comptes actifs, jamais bloqués, qui se laissent trouver ; sans adresse, nom court pour les non-amis. */
export async function searchPeople(viewer: Viewer, term: string): Promise<PersonResult[]> {
  const blocked = [...(await blockedWith(viewer.id))];
  const rows = await db.select({ id: users.id, name: users.name, avatarKey: users.avatarKey, programId: users.programId, program: programs.name }).from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id)).leftJoin(programs, eq(programs.id, users.programId))
    .where(and(
      eq(users.status, "active"), ne(users.id, viewer.id), ilike(users.name, `%${escapeLike(term)}%`),
      sql`coalesce(${userProfiles.privacy}->>'findable', 'true') <> 'false'`,
      blocked.length ? notInArray(users.id, blocked) : undefined,
    )).orderBy(asc(users.name)).limit(SEARCH_LIMIT * 3);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [links, profiles, nameOf] = await Promise.all([
    db.select({ requesterId: friendships.requesterId, addresseeId: friendships.addresseeId, status: friendships.status }).from(friendships)
      .where(or(and(eq(friendships.requesterId, viewer.id), inArray(friendships.addresseeId, ids)), and(eq(friendships.addresseeId, viewer.id), inArray(friendships.requesterId, ids)))),
    profilesOf(ids), namer(viewer),
  ]);
  // Un nom de famille caché ne sert jamais de critère : seul ce qui s'affiche peut correspondre
  const people: PersonResult[] = rows.filter((r) => matchesShownName(nameOf(r), term)).slice(0, SEARCH_LIMIT).map((r) => ({
    id: r.id, name: nameOf(r), avatarKey: r.avatarKey, profile: profiles.get(r.id) ?? null, program: r.program ?? null,
    relation: relationOf(viewer.id, links.find((l) => l.requesterId === r.id || l.addresseeId === r.id)),
  }));
  // Les amis puis sa licence d'abord, le reste de Campuss ensuite
  const near = new Set(rows.filter((r) => r.programId !== null && r.programId === viewer.programId).map((r) => r.id));
  const rank = (p: PersonResult) => (p.relation === "friends" ? 0 : near.has(p.id) ? 1 : 2);
  return people.sort((a, b) => rank(a) - rank(b));
}

/** Les abonnements d'une personne, pour l'onglet Abonnements (profils encore visibles seulement). */
export async function followsOf(viewer: Viewer) {
  const blocked = await blockedWith(viewer.id);
  const [people, topics] = await Promise.all([
    db.select({ id: users.id, name: users.name, avatarKey: users.avatarKey, status: users.status }).from(profileFollows).innerJoin(users, eq(profileFollows.followedId, users.id))
      .where(eq(profileFollows.followerId, viewer.id)).orderBy(asc(users.name)),
    db.select({ id: subjects.id, name: subjects.name, level: subjects.level }).from(subjectFollows).innerJoin(subjects, eq(subjectFollows.subjectId, subjects.id))
      .where(eq(subjectFollows.userId, viewer.id)).orderBy(asc(subjects.name)),
  ]);
  const shown = people.filter((p) => p.status === "active" && !blocked.has(p.id));
  const [profiles, nameOf] = await Promise.all([profilesOf(shown.map((p) => p.id)), namer(viewer)]);
  return { people: shown.map((p) => ({ id: p.id, name: nameOf(p), avatarKey: p.avatarKey, profile: profiles.get(p.id) ?? null })), subjects: topics };
}

export async function followsProfile(followerId: string, followedId: string) {
  const [row] = await db.select({ at: profileFollows.at }).from(profileFollows).where(and(eq(profileFollows.followerId, followerId), eq(profileFollows.followedId, followedId)));
  return Boolean(row);
}

export async function followsSubject(userId: string, subjectId: number) {
  const [row] = await db.select({ at: subjectFollows.at }).from(subjectFollows).where(and(eq(subjectFollows.userId, userId), eq(subjectFollows.subjectId, subjectId)));
  return Boolean(row);
}
