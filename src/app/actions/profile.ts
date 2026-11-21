"use server";

import { revalidatePath } from "next/cache";
import { saveProfileField, type SaveResult } from "@/app/actions/social";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { demoSaveRefusal } from "@/lib/demo";
import { forgetProfileCaches } from "@/lib/profile-data";
import { rateHit, rateLimited } from "@/lib/security";
import { cleanSocials } from "@/lib/socials";

const { userProfiles } = schema;

/**
 * Informations du profil, enregistrées ensemble depuis la page de profil : pronoms, bio, matière préférée, réseaux.
 * Le nom n'en fait pas partie : il vient de l'adresse universitaire et seule l'administration le corrige.
 */
export async function saveProfileInfo(input: { pronouns?: string; bio?: string; favorite?: string; socials?: unknown }): Promise<SaveResult> {
  const demo = demoSaveRefusal();
  if (demo) return demo;
  const user = await requireUser();
  const key = `profile-info:${user.id}`;
  if (await rateLimited(key, 60, 60)) return { ok: false, error: "Trop de changements, réessaie dans un moment" };
  await rateHit(key);
  if (input.socials !== undefined) {
    const socials = cleanSocials(input.socials);
    if (!socials.ok) return socials;
    await db.insert(userProfiles).values({ userId: user.id, socials: socials.value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: userProfiles.userId, set: { socials: socials.value, updatedAt: new Date() } });
    forgetProfileCaches(user.id);
  }
  for (const field of ["pronouns", "bio", "favorite"] as const) {
    const value = input[field];
    if (typeof value !== "string") continue;
    const result = await saveProfileField(field, value);
    if (!result.ok) return result;
  }
  revalidatePath(`/u/${user.id}`);
  return { ok: true };
}
