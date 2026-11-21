"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { cleanPrefs, parsePrefs, READING_KEYS, type Prefs } from "@/lib/prefs";
import { currentUser, requireUser, requireUserAny } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { demoSaveRefusal } from "@/lib/demo";
import type { ProfilePrivacy, UserProfile } from "@/lib/db/schema";
import { badgeOf } from "@/lib/badges";
import { yearLimited } from "@/lib/catalog";
import { profileStanding, syncBadges } from "@/lib/gamification";
import { isBlockedBetween } from "@/lib/friends";
import { avatarFrameOf, bannerOf, cleanNameStyle, cleanStatus, isAvatarEffect, isHue, nameProblem, statusExpiry, tidyName } from "@/lib/name-style";
import { forgetProfileCaches } from "@/lib/profile-data";
import { canViewProfile } from "@/lib/people";
import { rateHit, rateLimited } from "@/lib/security";
import { forgetShellCounters } from "@/lib/shell-cache";
import { bannerUnlock, cardUnlock, fontUnlock, frameUnlock, hueUnlock } from "@/lib/unlocks";
import { requestFriend } from "@/app/actions/friends";

const { users, userBadges, subjects, userProfiles } = schema;

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function savePrefs(change: Partial<Prefs>) {
  const store = await cookies();
  const user = await currentUser();
  const merged = cleanPrefs({ ...(user?.prefs ?? parsePrefs(store.get("campuss-prefs")?.value)), ...change });
  // Pendant un « voir comme », rien n'est écrit sur le compte vu (le proxy refuse déjà l'action)
  if (user && !user.viewing) await db.update(users).set({ prefs: merged }).where(eq(users.id, user.id));
  store.set("campuss-prefs", JSON.stringify(merged), { secure: true, sameSite: "lax", path: "/", maxAge: 365 * 86_400 });
}

/** Le panneau de lecture : chaque réglage est écrit, ceux remis par défaut sont effacés. */
export async function saveReadingPrefs(raw: Record<string, unknown>) {
  const clean = cleanPrefs(raw && typeof raw === "object" ? raw : {});
  await savePrefs(Object.fromEntries(READING_KEYS.map((key) => [key, clean[key]])) as Partial<Prefs>);
}

/** Une ligne user_profiles au premier réglage. */
async function patchProfile(userId: string, patch: Partial<Omit<UserProfile, "userId">>) {
  await db.insert(userProfiles).values({ userId, ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({ target: userProfiles.userId, set: { ...patch, updatedAt: new Date() } });
  forgetProfileCaches(userId);
  revalidatePath(`/u/${userId}`);
}

const PROFILE_FIELDS = ["name", "pronouns", "bio", "favorite"] as const;

/** Un champ du profil, enregistré seul à la sortie du champ. */
export async function saveProfileField(field: (typeof PROFILE_FIELDS)[number], raw: string): Promise<SaveResult> {
  // Démonstration : le nom et les textes du profil partagé ne changent pas
  const demo = demoSaveRefusal();
  if (demo) return demo;
  const user = await requireUserAny();
  if (!PROFILE_FIELDS.includes(field)) return { ok: false, error: "Champ inconnu" };
  const value = String(raw ?? "");
  if (field === "name") {
    // Le nom vient de l'adresse universitaire : seule l'administration le corrige
    if (user.role !== "admin") return { ok: false, error: "Ton nom ne se modifie pas ici : écris à l’administration pour le corriger" };
    const name = tidyName(value);
    if (name.length < 2) return { ok: false, error: "Indique ton nom, 2 caractères au moins" };
    const problem = nameProblem(name);
    if (problem) return { ok: false, error: problem };
    await db.update(users).set({ name }).where(eq(users.id, user.id));
    forgetShellCounters(user.id);
  }
  if (field === "pronouns") await db.update(users).set({ pronouns: value.trim().slice(0, 30) }).where(eq(users.id, user.id));
  if (field === "bio") {
    await db.update(users).set({ bio: value.trim().slice(0, 280) }).where(eq(users.id, user.id));
    await syncBadges(user.id);
  }
  if (field === "favorite") {
    const id = Number(value);
    const [subject] = id ? await db.select().from(subjects).where(eq(subjects.id, id)) : [];
    // Un étudiant choisit dans son année (celle déjà choisie reste acceptée) ; l'administration et les enseignants partout
    const inYear = !subject || !yearLimited(user) || subject.level === user.level || subject.id === user.favoriteSubjectId;
    if (!inYear) return { ok: false, error: "Choisis une matière de ton année" };
    await db.update(users).set({ favoriteSubjectId: subject && (user.role === "admin" || subject.programId === user.programId) ? subject.id : null }).where(eq(users.id, user.id));
  }
  revalidatePath(`/u/${user.id}`);
  return { ok: true };
}

/** Statut personnalisé : emoji, 60 caractères, durée. */
export async function saveStatus(input: { emoji?: string; text: string; duration: "heure" | "jour" | "semaine" | "jamais" }): Promise<SaveResult> {
  // Démonstration : le nom et les textes du profil partagé ne changent pas
  const demo = demoSaveRefusal();
  if (demo) return demo;
  const user = await requireUser();
  const duration = (["heure", "jour", "semaine", "jamais"] as const).find((d) => d === input.duration) ?? "jamais";
  const status = cleanStatus({ emoji: input.emoji, text: String(input.text ?? ""), expiresAt: statusExpiry(duration) });
  await patchProfile(user.id, { status });
  return { ok: true };
}

export type AppearancePatch = Partial<Pick<UserProfile, "nameStyle" | "badgeShown" | "banner" | "profileColors" | "avatarFrame" | "avatarEffect">>;

/** Personnalisation : chaque élément est vérifié contre ce qui est débloqué ; rien ne s'achète. */
export async function saveAppearance(patch: AppearancePatch): Promise<SaveResult> {
  const user = await requireUser();
  const key = `appearance:${user.id}`;
  if (await rateLimited(key, 120, 60)) return { ok: false, error: "Trop de changements, réessaie dans un moment" };
  await rateHit(key);
  const [current] = await db.select().from(userProfiles).where(eq(userProfiles.userId, user.id));
  if (current?.appearanceLockedUntil && current.appearanceLockedUntil > new Date()) return { ok: false, error: "Apparence réinitialisée par la modération, modifiable plus tard" };
  const { unlocked, earned } = await profileStanding(user);
  const refuse = (what: string): SaveResult => ({ ok: false, error: `${what} : pas encore débloqué` });
  const out: AppearancePatch = {};
  if ("nameStyle" in patch) {
    const style = cleanNameStyle(patch.nameStyle);
    if (style.hue !== undefined && !unlocked[hueUnlock(style.hue)].open) return refuse("Couleur du nom");
    if (style.gradient && !unlocked["degrade-nom"].open) return refuse("Dégradé du nom");
    if (style.font && !unlocked[fontUnlock(style.font)].open) return refuse("Police du nom");
    if (style.effect && !unlocked.effets.open) return refuse("Effet");
    out.nameStyle = Object.keys(style).length ? style : null;
  }
  if ("badgeShown" in patch) {
    const badge = patch.badgeShown ? badgeOf(patch.badgeShown) : null;
    if (patch.badgeShown && (!badge || !earned.has(badge.id))) return refuse("Ce badge");
    out.badgeShown = badge?.id ?? null;
  }
  if ("banner" in patch) {
    const banner = patch.banner;
    if (banner && banner.kind !== "image") {
      const found = bannerOf(banner.value);
      if (!found || found.kind !== banner.kind) return { ok: false, error: "Bannière inconnue" };
      if (!unlocked[bannerUnlock(found.id, found.kind)].open) return refuse("Bannière");
      out.banner = { kind: banner.kind, value: banner.value };
    } else if (banner) {
      // L'image passe par /api/account/banner (nettoyée) ; ici on ne peut que la garder
      if (current?.banner?.kind !== "image") return { ok: false, error: "Envoie d’abord une image" };
    } else out.banner = null;
  }
  if ("profileColors" in patch) {
    const colors = patch.profileColors ?? {};
    const clean: Record<string, string> = {};
    for (const slot of ["card"]) if (colors[slot] !== undefined && isHue(Number(colors[slot]))) clean[slot] = String(Number(colors[slot]));
    if (clean.card !== undefined && !unlocked[cardUnlock(Number(clean.card))].open) return refuse("Couleur de la carte");
    out.profileColors = Object.keys(clean).length ? clean : null;
  }
  if ("avatarFrame" in patch) {
    // Liste fermée : un identifiant inconnu est refusé, jamais enregistré ni remplacé en silence
    const frame = avatarFrameOf(patch.avatarFrame);
    if (patch.avatarFrame && !frame) return { ok: false, error: "Cadre inconnu" };
    const rule = frame ? frameUnlock(frame.id) : null;
    if (frame && (!rule || !unlocked[rule].open)) return refuse("Ce cadre");
    out.avatarFrame = frame?.id ?? null;
  }
  if ("avatarEffect" in patch) {
    const effect = isAvatarEffect(patch.avatarEffect) ? patch.avatarEffect : null;
    if (effect && !unlocked.effets.open) return refuse("Effet");
    out.avatarEffect = effect;
  }
  if (Object.keys(out).length) await patchProfile(user.id, out);
  return { ok: true };
}

/** « Afficher à côté de mon nom », depuis le détail d'un badge. */
export async function showBadge(id: string | null): Promise<SaveResult> {
  return saveAppearance({ badgeShown: id });
}

/** Vitrine : 3 cours publiés et 3 badges obtenus, dans l'ordre choisi. */
export async function saveShowcase(input: { docs: string[]; badges: string[] }): Promise<SaveResult> {
  const user = await requireUser();
  const { unlocked, earned } = await profileStanding(user);
  if (!unlocked.vitrine.open) return { ok: false, error: "Vitrine : publie un premier cours" };
  const ids = z.array(z.uuid()).max(3).safeParse(input.docs ?? []);
  if (!ids.success) return { ok: false, error: "Trois cours au plus" };
  const mine = ids.data.length ? await db.select({ id: schema.documents.id }).from(schema.documents)
    .where(and(inArray(schema.documents.id, ids.data), eq(schema.documents.createdBy, user.id), eq(schema.documents.published, true), isNull(schema.documents.deletedAt))) : [];
  const docs = ids.data.filter((id) => mine.some((d) => d.id === id));
  const badges = [...new Set((input.badges ?? []).map((id) => badgeOf(String(id))?.id).filter((id): id is string => Boolean(id) && earned.has(id!)))].slice(0, 3);
  await patchProfile(user.id, { showcase: { docs, badges } });
  return { ok: true };
}

/** Confidentialité : partage de la révision, « en train de réviser », activité (coupés par défaut) ; recherche par nom (permise par défaut). */
export async function savePrivacy(patch: ProfilePrivacy): Promise<SaveResult> {
  const user = await requireUser();
  const [current] = await db.select({ privacy: userProfiles.privacy }).from(userProfiles).where(eq(userProfiles.userId, user.id));
  const next: ProfilePrivacy = { ...(current?.privacy ?? {}) };
  if (typeof patch.shareStudy === "boolean") next.shareStudy = patch.shareStudy;
  if (typeof patch.showStudying === "boolean") next.showStudying = patch.showStudying;
  if (patch.activity === "friends" || patch.activity === "none") next.activity = patch.activity;
  if (typeof patch.findable === "boolean") next.findable = patch.findable;
  await patchProfile(user.id, { privacy: next });
  return { ok: true };
}

export async function saveRanking(show: boolean): Promise<SaveResult> {
  const user = await requireUser();
  await db.update(users).set({ showInRanking: z.boolean().parse(show) }).where(eq(users.id, user.id));
  revalidatePath("/reviser/classement");
  return { ok: true };
}

export async function saveLevel(level: number): Promise<SaveResult> {
  const user = await requireUserAny();
  if (![1, 2, 3].includes(level)) return { ok: false, error: "Année inconnue" };
  await db.update(users).set({ level }).where(eq(users.id, user.id));
  return { ok: true };
}

export async function unblockUser(rawId: string): Promise<SaveResult> {
  const user = await requireUser();
  const id = z.uuid().parse(rawId);
  await db.delete(schema.userBlocks).where(and(eq(schema.userBlocks.blockerId, user.id), eq(schema.userBlocks.blockedId, id)));
  revalidatePath("/parametres/confidentialite");
  return { ok: true };
}

const REPORT_FIELDS = ["name", "bio", "status", "avatar", "banner"] as const;

/** Signaler un profil : la modération voit le champ et le motif, la personne n'apprend pas qui l'a signalée. */
export async function reportProfile(input: { target: string; field: string; reason?: string }): Promise<SaveResult> {
  const user = await requireUser();
  const target = z.uuid().parse(input.target);
  const field = REPORT_FIELDS.find((f) => f === input.field);
  if (!field || target === user.id) return { ok: false, error: "Choisis ce qui pose problème" };
  const key = `profile-report:${user.id}`;
  if (await rateLimited(key, 10, 1440)) return { ok: false, error: "Trop de signalements aujourd’hui" };
  const [person] = await db.select().from(users).where(eq(users.id, target));
  if (!person || !(await canViewProfile(user, person))) return { ok: false, error: "Profil introuvable" };
  await rateHit(key);
  await db.insert(schema.profileReports).values({ targetId: target, reporterId: user.id, field, reason: String(input.reason ?? "").trim().slice(0, 500) });
  return { ok: true };
}

/** Ajouter en ami depuis un profil visible : passe par la même demande que le code, sans jamais montrer ce code. */
export async function askFriend(rawId: string): Promise<SaveResult> {
  const user = await requireUser();
  const id = z.uuid().parse(rawId);
  const [person] = await db.select().from(users).where(eq(users.id, id));
  if (!person || person.id === user.id || !(await canViewProfile(user, person)) || await isBlockedBetween(user.id, person.id)) return { ok: false, error: "Demande impossible" };
  const form = new FormData();
  form.set("who", person.friendCode);
  const result = await requestFriend(null, form);
  revalidatePath(`/u/${id}`);
  return result?.error ? { ok: false, error: result.error } : { ok: true };
}

export async function markBadgesSeen(badges: string[]) {
  const user = await currentUser();
  if (!user || user.viewing) return;
  const ids = z.array(z.string().max(32)).max(30).parse(badges);
  if (ids.length) await db.update(userBadges).set({ seen: true }).where(and(eq(userBadges.userId, user.id), inArray(userBadges.badge, ids)));
  // Sinon la même annonce reviendrait à la page suivante
  forgetShellCounters(user.id);
}
