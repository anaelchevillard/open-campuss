"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { isBlockedBetween } from "@/lib/friends";
import { canViewProfile, searchPeople, type PersonResult } from "@/lib/people";
import { SEARCH_RATE, searchTerm } from "@/lib/people-rules";
import { rateHit, rateLimited } from "@/lib/security";

const { profileFollows, subjectFollows, subjects, users } = schema;

// Un abonnement se fait et se défait au clic : plafond large, mais pas de boucle sans fin
const FOLLOW_RATE = { limit: 200, minutes: 1440 } as const;

type Outcome = { ok: true } | { ok: false; error: string };

/** Recherche de personnes par nom, côté serveur seulement, limitée par compte contre l'énumération. */
export async function findPeople(raw: string): Promise<{ people: PersonResult[] } | { error: string }> {
  const user = await requireUser();
  const term = searchTerm(raw);
  if (!term) return { people: [] };
  const key = `people-search:${user.id}`;
  if (await rateLimited(key, SEARCH_RATE.limit, SEARCH_RATE.minutes)) return { error: "Trop de recherches, réessaie dans un moment" };
  await rateHit(key);
  return { people: await searchPeople(user, term) };
}

async function followBudget(userId: string) {
  const key = `follow:${userId}`;
  if (await rateLimited(key, FOLLOW_RATE.limit, FOLLOW_RATE.minutes)) return false;
  await rateHit(key);
  return true;
}

/** S'abonner au profil de quelqu'un (ses nouveaux cours publiés), ou se désabonner. */
export async function followProfile(rawId: string, on: boolean): Promise<Outcome> {
  const user = await requireUser();
  const id = z.uuid().parse(rawId);
  if (!on) {
    await db.delete(profileFollows).where(and(eq(profileFollows.followerId, user.id), eq(profileFollows.followedId, id)));
    revalidatePath("/amis");
    return { ok: true };
  }
  if (!(await followBudget(user.id))) return { ok: false, error: "Trop d’abonnements aujourd’hui" };
  const [person] = await db.select().from(users).where(eq(users.id, id));
  if (!person || person.id === user.id || !(await canViewProfile(user, person)) || (await isBlockedBetween(user.id, person.id))) return { ok: false, error: "Abonnement impossible" };
  await db.insert(profileFollows).values({ followerId: user.id, followedId: id }).onConflictDoNothing();
  revalidatePath("/amis");
  return { ok: true };
}

/** S'abonner à une matière de sa licence (ses nouveaux cours), ou se désabonner. */
export async function followSubject(rawId: number, on: boolean): Promise<Outcome> {
  const user = await requireUser();
  const id = z.number().int().positive().parse(rawId);
  if (!on) {
    await db.delete(subjectFollows).where(and(eq(subjectFollows.userId, user.id), eq(subjectFollows.subjectId, id)));
    revalidatePath("/amis");
    return { ok: true };
  }
  if (!(await followBudget(user.id))) return { ok: false, error: "Trop d’abonnements aujourd’hui" };
  const [subject] = await db.select({ programId: subjects.programId }).from(subjects).where(eq(subjects.id, id));
  // Comme la page de la matière : seulement celles de sa licence
  if (!subject || (user.role !== "admin" && subject.programId !== user.programId)) return { ok: false, error: "Matière introuvable" };
  await db.insert(subjectFollows).values({ userId: user.id, subjectId: id }).onConflictDoNothing();
  revalidatePath("/amis");
  return { ok: true };
}
