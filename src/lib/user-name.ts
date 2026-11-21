import "server-only";
import { and, eq, or } from "drizzle-orm";
import { cache } from "react";
import { db, schema } from "./db";
import type { User } from "./db/schema";
import { shortName } from "./user-name-rules";

const { friendships } = schema;

/** Les amis acceptés de quelqu'un, lus une fois par requête. */
export const friendIdsOf = cache(async (userId: string): Promise<Set<string>> => {
  const rows = await db.select({ a: friendships.requesterId, b: friendships.addresseeId }).from(friendships)
    .where(and(eq(friendships.status, "accepted"), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))));
  return new Set(rows.map((r) => (r.a === userId ? r.b : r.a)));
});

type Viewer = Pick<User, "id" | "role">;

/**
 * La seule règle pour un nom montré à quelqu'un d'autre : soi-même, ses amis et l'administration voient le nom entier,
 * les autres « Prénom N. ». À appeler côté serveur, avant que le nom ne parte vers le navigateur.
 */
export async function namer(viewer: Viewer | null) {
  const friends = viewer ? await friendIdsOf(viewer.id) : new Set<string>();
  const full = viewer?.role === "admin";
  return (person: { id: string | null; name: string }) => (full || (person.id && (person.id === viewer?.id || friends.has(person.id))) ? person.name : shortName(person.name));
}

/** Même règle sur une liste d'objets qui ont `id` et `name` : renvoie de nouveaux objets. */
export async function withVisibleNames<T extends { id: string | null; name: string }>(viewer: Viewer | null, people: T[]): Promise<T[]> {
  const nameOf = await namer(viewer);
  return people.map((p) => ({ ...p, name: nameOf(p) }));
}

