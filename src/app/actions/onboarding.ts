"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, requireUserAny } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { cleanPrefs, type Prefs } from "@/lib/prefs";
import { HOME } from "@/lib/home";

const INTENTS = ["read", "exam", "share"] as const;

/** Ce qui a amené la personne ordonne l'accueil et « Bien démarrer » ; l'année, elle, est connue depuis l'inscription. */
export async function finishOnboarding(intent?: string) {
  const user = await requireUserAny();
  const chosen = (INTENTS as readonly string[]).includes(intent ?? "") ? intent as Prefs["intent"] : undefined;
  await db.update(schema.users).set({ onboardedAt: new Date(), prefs: cleanPrefs({ ...user.prefs, intent: chosen ?? user.prefs.intent }) }).where(eq(schema.users.id, user.id));
  redirect(HOME);
}

/** Fermer « Bien démarrer », ou la rouvrir (« Annuler »). */
export async function setChecklistDismissed(dismissed: boolean) {
  const user = await requireUser();
  await db.update(schema.users).set({ prefs: cleanPrefs({ ...user.prefs, checklistDismissed: dismissed }) }).where(eq(schema.users.id, user.id));
  revalidatePath(HOME);
}
