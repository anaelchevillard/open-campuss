"use server";

import { trackEvent } from "@/lib/product-events";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canRead } from "@/lib/access-server";
import { audit, requireModerator, requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { canModeratePack, FREE_SCOPE, MAX_PACK_CARDS, publishRefusal, shouldInvitePublish } from "@/lib/memo-pack-rules";
import { packCards, readablePack } from "@/lib/memo-packs";
import { notify } from "@/lib/notify";
import { rateHit, rateLimited } from "@/lib/security";
import { forgetAllShellCounters, forgetShellCounters } from "@/lib/shell-cache";
import { shortName } from "@/lib/user-name-rules";
import type { FormState } from "@/components/action-form";

const { documents, flashcards, memoPacks, memoPackCopies, memoPackReports } = schema;

const uuid = z.uuid();
const scopeSchema = z.union([z.literal(FREE_SCOPE), z.uuid()]);
const on = (form: FormData, name: string) => ["1", "on", "true"].includes(String(form.get(name)));

const refresh = (id?: string) => {
  revalidatePath("/reviser/fiches");
  revalidatePath("/reviser/fiches/paquets");
  if (id) revalidatePath(`/reviser/fiches/paquets/${id}`);
};

/** Publier, partager, refuser : 30 changements par jour, comme une écriture ordinaire. */
const SHARE_PER_DAY = 30;
const shareLimited = async (userId: string) => {
  const key = `pack-share:${userId}`;
  if (await rateLimited(key, SHARE_PER_DAY, 1440)) return true;
  await rateHit(key);
  return false;
};

/** Mes fiches d'une portée (la propriété est vérifiée ici : seules les fiches de la personne comptent). */
const myScope = (userId: string, scope: string) => and(eq(flashcards.userId, userId), scope === FREE_SCOPE ? sql`${flashcards.documentId} is null` : eq(flashcards.documentId, scope));

async function packTitle(scope: string) {
  if (scope === FREE_SCOPE) return "Fiches libres";
  const [doc] = await db.select({ title: documents.title }).from(documents).where(eq(documents.id, scope));
  return (doc?.title || "Sans titre").slice(0, 120);
}

export type PublishPreview = {
  scope: string; title: string; count: number; author: string; program: string;
  sample: { front: string; back: string }[]; refusal: string | null; public: boolean; packId: string | null;
};

/**
 * Ce qui sera public si je publie ce paquet : titre, nombre de fiches, quelques fiches, mon prénom et ma licence.
 * Sans `force`, rien n'est renvoyé si l'invitation n'a pas lieu d'être (trop peu de fiches, déjà public, déjà refusé).
 */
export async function publishPreview(rawScope: string, force = false): Promise<PublishPreview | null> {
  const user = await requireUser();
  const scope = scopeSchema.parse(rawScope);
  const [[{ n }], sample, [pack], [program]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(flashcards).where(myScope(user.id, scope)),
    db.select({ front: flashcards.front, back: flashcards.back }).from(flashcards).where(myScope(user.id, scope)).orderBy(flashcards.createdAt).limit(3),
    db.select().from(memoPacks).where(and(eq(memoPacks.ownerId, user.id), eq(memoPacks.scope, scope))),
    user.programId ? db.select({ name: schema.programs.name }).from(schema.programs).where(eq(schema.programs.id, user.programId)) : Promise.resolve([]),
  ]);
  const state = { cards: n, programId: user.programId, pack: pack ?? null };
  if (!force && !shouldInvitePublish(state)) return null;
  return {
    scope, title: await packTitle(scope), count: n, author: shortName(user.name), program: program?.name ?? "ta licence",
    sample, refusal: publishRefusal(state), public: Boolean(pack?.public && !pack.removedAt), packId: pack?.id ?? null,
  };
}

/** Publier un de mes paquets dans la bibliothèque de ma licence, en un geste. Modération après coup (signalement, retrait). */
export async function publishPack(rawScope: string): Promise<{ ok: string; id: string } | { error: string }> {
  const user = await requireUser();
  const scope = scopeSchema.parse(rawScope);
  const [[{ n }], [existing]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(flashcards).where(myScope(user.id, scope)),
    db.select().from(memoPacks).where(and(eq(memoPacks.ownerId, user.id), eq(memoPacks.scope, scope))),
  ]);
  const refusal = publishRefusal({ cards: n, programId: user.programId, pack: existing ?? null });
  if (refusal) return { error: refusal };
  if (await shareLimited(user.id)) return { error: "Trop de changements de partage aujourd’hui." };
  const values = { public: true, programId: user.programId, title: await packTitle(scope), updatedAt: new Date() };
  const [saved] = existing
    ? await db.update(memoPacks).set(values).where(eq(memoPacks.id, existing.id)).returning({ id: memoPacks.id })
    : await db.insert(memoPacks).values({ ownerId: user.id, scope, documentId: scope === FREE_SCOPE ? null : scope, friends: false, ...values }).returning({ id: memoPacks.id });
  refresh(saved.id);
  await trackEvent("pack_published", user);
  return { ok: "Publié pour ta promo. Merci !", id: saved.id };
}

/** « Pas pour ce paquet » : l'invitation ne revient plus pour ce paquet. Il reste publiable depuis Mes paquets. */
export async function declinePublish(rawScope: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const scope = scopeSchema.parse(rawScope);
  const [card] = await db.select({ id: flashcards.id }).from(flashcards).where(myScope(user.id, scope)).limit(1);
  if (!card) return { error: "Ce paquet ne contient aucune fiche." };
  if (await shareLimited(user.id)) return { error: "Trop de changements de partage aujourd’hui." };
  const [existing] = await db.select({ id: memoPacks.id }).from(memoPacks).where(and(eq(memoPacks.ownerId, user.id), eq(memoPacks.scope, scope)));
  if (existing) await db.update(memoPacks).set({ publishDeclinedAt: new Date() }).where(eq(memoPacks.id, existing.id));
  else await db.insert(memoPacks).values({ ownerId: user.id, scope, documentId: scope === FREE_SCOPE ? null : scope, title: await packTitle(scope), programId: user.programId, publishDeclinedAt: new Date() }).onConflictDoNothing();
  return { ok: true };
}

/** Partage d'un de mes paquets : avec mes amis, et/ou dans la bibliothèque publique de ma licence. */
export async function sharePack(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const scope = scopeSchema.parse(form.get("scope"));
  const friends = on(form, "friends");
  const publish = on(form, "public");
  const [card] = await db.select({ id: flashcards.id }).from(flashcards)
    .where(and(eq(flashcards.userId, user.id), scope === FREE_SCOPE ? sql`${flashcards.documentId} is null` : eq(flashcards.documentId, scope))).limit(1);
  if (!card) return { error: "Ce paquet ne contient aucune fiche." };
  if (publish && !user.programId) return { error: "Choisis ta licence pour publier un paquet." };
  const [existing] = await db.select().from(memoPacks).where(and(eq(memoPacks.ownerId, user.id), eq(memoPacks.scope, scope)));
  if (publish && existing?.removedAt) return { error: "Ce paquet a été retiré par la modération : il ne peut plus être publié." };
  if (await shareLimited(user.id)) return { error: "Trop de changements de partage aujourd’hui." };
  const title = await packTitle(scope);
  const values = { friends, public: publish, title, programId: publish ? user.programId : existing?.programId ?? user.programId, updatedAt: new Date() };
  if (existing) await db.update(memoPacks).set(values).where(eq(memoPacks.id, existing.id));
  else await db.insert(memoPacks).values({ ownerId: user.id, scope, documentId: scope === FREE_SCOPE ? null : scope, ...values });
  refresh(existing?.id);
  return { ok: !friends && !publish ? "Paquet gardé pour toi." : publish ? "Paquet publié dans la bibliothèque de ta licence." : "Paquet partagé avec tes amis." };
}

type Reader = Awaited<ReturnType<typeof requireUser>>;
type ReadablePack = NonNullable<Awaited<ReturnType<typeof readablePack>>>;

/** Où vont les fiches copiées : le cours du paquet si je peux le lire, sinon mes fiches libres. */
async function copyTarget(user: Reader, pack: ReadablePack) {
  if (!pack.documentId) return null;
  const [doc] = await db.select().from(documents).where(eq(documents.id, pack.documentId));
  return doc && !doc.deletedAt && (await canRead(user, doc)) ? doc.id : null;
}

/** Copie les fiches d'un paquet lisible : nouvelles fiches, à apprendre depuis le début ; 20 copies par jour. */
async function copyCards(user: Reader, pack: ReadablePack): Promise<{ count: number; documentId: string | null } | { error: string }> {
  const key = `pack-copy:${user.id}`;
  if (await rateLimited(key, 20, 1440)) return { error: "Trop de paquets copiés aujourd’hui." };
  const cards = (await packCards(pack)).slice(0, MAX_PACK_CARDS);
  if (!cards.length) return { error: "Ce paquet est vide." };
  await rateHit(key);
  const documentId = await copyTarget(user, pack);
  await db.transaction(async (tx) => {
    await tx.insert(flashcards).values(cards.map((c) => ({ userId: user.id, documentId, front: c.front, back: c.back })));
    const [first] = await tx.insert(memoPackCopies).values({ packId: pack.id, userId: user.id }).onConflictDoNothing().returning();
    if (first) await tx.update(memoPacks).set({ copies: sql`${memoPacks.copies} + 1` }).where(eq(memoPacks.id, pack.id));
  });
  await trackEvent("cards_imported", { id: user.id });
  forgetShellCounters(user.id);
  refresh(pack.id);
  revalidatePath("/reviser");
  return { count: cards.length, documentId };
}

/** Copie un paquet lisible dans mes fiches. */
export async function copyPack(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const pack = await readablePack(user, uuid.parse(form.get("id")));
  if (!pack || pack.removedAt) return { error: "Ce paquet n’est plus disponible." };
  if (pack.ownerId === user.id) return { error: "Ce paquet est déjà dans tes fiches." };
  const copied = await copyCards(user, pack);
  if ("error" in copied) return copied;
  return { ok: `${copied.count} fiche${copied.count > 1 ? "s" : ""} ajoutée${copied.count > 1 ? "s" : ""} à tes fiches.` };
}

/**
 * « Réviser » un paquet de la promo : en un clic, ses fiches rejoignent les miennes (une seule fois)
 * et la séance commence. Mon propre paquet ouvre directement sa séance.
 */
export async function revisePack(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const pack = await readablePack(user, uuid.parse(form.get("id")));
  if (!pack || pack.removedAt) return { error: "Ce paquet n’est plus disponible." };
  if (pack.ownerId === user.id) redirect(`/reviser/seance?mode=fiches&paquet=${pack.scope}`);
  const target = await copyTarget(user, pack);
  const [already] = await db.select({ at: memoPackCopies.at }).from(memoPackCopies).where(and(eq(memoPackCopies.packId, pack.id), eq(memoPackCopies.userId, user.id)));
  const [kept] = already ? await db.select({ id: flashcards.id }).from(flashcards).where(myScope(user.id, target ?? FREE_SCOPE)).limit(1) : [];
  if (!kept) {
    const copied = await copyCards(user, pack);
    if ("error" in copied) return copied;
  }
  redirect(`/reviser/seance?mode=fiches&paquet=${target ?? FREE_SCOPE}${kept ? "&tout=1" : ""}`);
}

/** Signale un paquet public : il part dans la file de modération de sa licence. */
export async function reportPack(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const pack = await readablePack(user, uuid.parse(form.get("id")));
  if (!pack || !pack.public || pack.ownerId === user.id) return { error: "Ce paquet ne peut pas être signalé." };
  const key = `pack-report:${user.id}`;
  if (await rateLimited(key, 10, 1440)) return { error: "Trop de signalements aujourd’hui." };
  await rateHit(key);
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500);
  await db.insert(memoPackReports).values({ packId: pack.id, reporterId: user.id, reason }).onConflictDoNothing();
  forgetAllShellCounters();
  revalidatePath("/moderation");
  return { ok: "Merci, la modération va regarder ce paquet." };
}

/** Retrait, maintien ou rétablissement d'un paquet public : délégué de la licence ou administration. */
export async function moderatePack(form: FormData) {
  const user = await requireModerator();
  const id = uuid.parse(form.get("id"));
  const decision = z.enum(["remove", "keep", "restore"]).parse(form.get("decision"));
  const [pack] = await db.select().from(memoPacks).where(eq(memoPacks.id, id));
  if (!pack || !canModeratePack(user, pack)) return;
  await db.transaction(async (tx) => {
    if (decision === "remove") await tx.update(memoPacks).set({ removedAt: new Date(), removedBy: user.id }).where(eq(memoPacks.id, id));
    if (decision === "restore") await tx.update(memoPacks).set({ removedAt: null, removedBy: null }).where(eq(memoPacks.id, id));
    if (decision !== "restore") await tx.update(memoPackReports).set({ status: decision === "remove" ? "removed" : "kept", closedBy: user.id }).where(and(eq(memoPackReports.packId, id), eq(memoPackReports.status, "open")));
  });
  await audit(user.email, decision === "remove" ? "paquet_retiré" : decision === "keep" ? "paquet_gardé" : "paquet_rétabli", pack.title);
  if (decision === "remove") await notify(pack.ownerId, { kind: "rejected", title: "Paquet de fiches retiré de la bibliothèque", body: `« ${pack.title} » a été retiré par la modération. Tes fiches restent dans ton compte.`, href: "/reviser/fiches", dedupeKey: `pack-removed:${pack.id}:${Date.now()}` });
  forgetAllShellCounters();
  revalidatePath("/moderation");
  refresh(id);
}
