"use server";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canRead } from "@/lib/access-server";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { habitSnapshot } from "@/lib/habits";
import { inviteCodeOf } from "@/lib/referrals";
import { seasonOf } from "@/lib/seasons";
import { randomToken, rateHit, rateLimited } from "@/lib/security";
import { cleanGoal, cleanReminderHour, parisDay, vacationEnd } from "@/lib/study-habits";
import { savePrefs } from "@/app/actions/social";
import type { ProfilePrivacy } from "@/lib/db/schema";
import { HOME } from "@/lib/home";

const { documents, shareLinks, userHabits } = schema;

export async function setDailyGoal(value: number) {
  const user = await requireUser();
  const dailyGoal = cleanGoal(value);
  await db.insert(userHabits).values({ userId: user.id, dailyGoal }).onConflictDoUpdate({ target: userHabits.userId, set: { dailyGoal } });
  revalidatePath(HOME);
  revalidatePath("/reviser");
  return habitSnapshot(user.id);
}

/** Rappel du jour : une heure entre 7 h et 22 h, ou aucun. */
export async function setReminderHour(value: number | null) {
  const user = await requireUser();
  const reminderHour = cleanReminderHour(value);
  await db.insert(userHabits).values({ userId: user.id, reminderHour }).onConflictDoUpdate({ target: userHabits.userId, set: { reminderHour } });
  revalidatePath("/parametres/revision");
  return reminderHour;
}

/** Mode vacances : la série est gelée de 1 à 14 jours ; 0 l'arrête. */
export async function setVacation(days: number) {
  const user = await requireUser();
  const vacationUntil = vacationEnd(parisDay(new Date()), days);
  await db.insert(userHabits).values({ userId: user.id, vacationUntil }).onConflictDoUpdate({ target: userHabits.userId, set: { vacationUntil } });
  revalidatePath("/reviser");
  revalidatePath("/parametres/revision");
  return vacationUntil;
}

/** Préférences de révision qui vivent dans users.prefs : jeu masqué, sons, vibrations. */
export async function setGamePref(key: "hideGame" | "sounds" | "haptics", on: boolean) {
  await requireUser();
  await savePrefs({ [key]: on ? true : undefined });
  revalidatePath("/", "layout");
}

/**
 * Partage de la révision avec ses amis (ligue, activité) et statut « en train de réviser ».
 * Ne touche que ces deux clés de user_profiles.privacy : le reste appartient aux réglages de confidentialité.
 */
export async function setStudyPrivacy(key: "shareStudy" | "showStudying", on: boolean) {
  const user = await requireUser();
  const change: ProfilePrivacy = { [key]: on };
  await db.insert(schema.userProfiles).values({ userId: user.id, privacy: change })
    .onConflictDoUpdate({ target: schema.userProfiles.userId, set: { privacy: sql`${schema.userProfiles.privacy} || ${JSON.stringify(change)}::jsonb`, updatedAt: new Date() } });
  revalidatePath("/reviser");
  revalidatePath("/reviser/ensemble");
  revalidatePath("/parametres/revision");
}

export async function dismissSeasonBanner() {
  const user = await requireUser();
  const seasonDismissed = seasonOf(new Date()).key;
  await db.insert(userHabits).values({ userId: user.id, seasonDismissed }).onConflictDoUpdate({ target: userHabits.userId, set: { seasonDismissed } });
}

const shareUrl = (token: string) => `${env.baseUrl}/p/${token}`;

/** Ouvrir le panneau redonne le lien déjà actif : on n'accumule pas des liens que personne ne pourrait retrouver. */
export async function shareCourse(rawId: string): Promise<{ url: string } | { error: string }> {
  const user = await requireUser();
  const id = z.uuid().parse(rawId);
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc || !(await canRead(user, doc)) || !doc.published || doc.hiddenByReports) return { error: "Ce cours ne peut pas être partagé." };
  const [existing] = await db.select({ token: shareLinks.token }).from(shareLinks).where(and(eq(shareLinks.documentId, id), eq(shareLinks.createdBy, user.id), isNull(shareLinks.revokedAt))).orderBy(desc(shareLinks.createdAt)).limit(1);
  if (existing) return { url: shareUrl(existing.token) };
  const key = `share:${user.id}`;
  if (await rateLimited(key, 30, 1440)) return { error: "Trop de liens créés aujourd’hui. Réessaie demain." };
  await rateHit(key);
  // Le code d'invitation existe avant que le lien circule : la page publique peut alors renvoyer vers l'inscription
  await inviteCodeOf(user.id);
  const token = randomToken();
  await db.insert(shareLinks).values({ token, documentId: id, createdBy: user.id });
  return { url: shareUrl(token) };
}

export async function revokeShare(rawId: string) {
  const user = await requireUser();
  await db.update(shareLinks).set({ revokedAt: new Date() }).where(and(eq(shareLinks.documentId, z.uuid().parse(rawId)), eq(shareLinks.createdBy, user.id), isNull(shareLinks.revokedAt)));
  revalidatePath("/amis");
}

export async function revokeShareForm(form: FormData) {
  await revokeShare(String(form.get("document")));
}
