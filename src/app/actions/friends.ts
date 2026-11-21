"use server";

import { randomBytes } from "node:crypto";
import { and, eq, gt, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { shortName } from "@/lib/user-name-rules";
import type { FormState } from "@/components/action-form";
import { canRead } from "@/lib/access-server";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { canPlay, DUEL_DAYS } from "@/lib/duels";
import { env } from "@/lib/env";
import { areFriends, isBlockedBetween } from "@/lib/friends";
import { MAX_GROUP_MEMBERS } from "@/lib/groups";
import { notify } from "@/lib/notify";
import { rateHit, rateLimited } from "@/lib/security";
import { forgetShellCounters } from "@/lib/shell-cache";

const { friendships, friendInvites, friendReactions, users, revisionMembers, revisionSpaces, quizDuels, quizAttempts, studyGroupMembers, studyGroups, documents } = schema;

/** La réponse ne dit jamais si le code ou l'adresse existe : impossible de sonder les comptes par ce formulaire. */
const SENT = "Demande envoyée";

type Context = { kind: "group" | "duel" | "revision" | "course"; id: string };

const refresh = () => { revalidatePath("/amis"); revalidatePath("/reviser/ensemble"); };

/**
 * L'intention d'une demande (groupe, défi, révision) se réalise seule à l'acceptation : l'ami rejoint le groupe,
 * reçoit le défi ou l'invitation à réviser. Seulement si celui qui a demandé en a encore le droit.
 */
async function fulfil(requester: Pick<User, "id" | "name">, addresseeId: string, context: Context | null | undefined) {
  if (!context || !z.uuid().safeParse(context.id).success) return;
  if (context.kind === "group") {
    const [group] = await db.select().from(studyGroups).where(and(eq(studyGroups.id, context.id), eq(studyGroups.ownerId, requester.id)));
    if (!group) return;
    const [size] = await db.select({ n: sql<number>`count(*)::int` }).from(studyGroupMembers).where(and(eq(studyGroupMembers.groupId, group.id), sql`${studyGroupMembers.status} <> 'refused'`));
    if (size.n >= MAX_GROUP_MEMBERS) return;
    const [added] = await db.insert(studyGroupMembers).values({ groupId: group.id, userId: addresseeId }).onConflictDoNothing().returning();
    if (added) await notify(addresseeId, { kind: "group", title: `${requester.name} t’invite à réviser ensemble`, body: group.name, href: "/reviser/ensemble" });
  } else if (context.kind === "revision") {
    const [space] = await db.select().from(revisionSpaces).where(and(eq(revisionSpaces.id, context.id), eq(revisionSpaces.ownerId, requester.id)));
    if (!space) return;
    const [added] = await db.insert(revisionMembers).values({ spaceId: space.id, userId: addresseeId }).onConflictDoNothing().returning();
    if (added) await notify(addresseeId, { kind: "revision_invite", title: `${requester.name} t’invite à réviser`, href: "/reviser" });
  } else if (context.kind === "duel") {
    // Le contexte d'un défi est le cours : le score à battre est relu en base, jamais pris au navigateur
    const [doc] = await db.select().from(documents).where(eq(documents.id, context.id));
    const [friend] = await db.select().from(users).where(eq(users.id, addresseeId));
    if (!doc || !friend || !canPlay(doc) || !(await canRead(friend, doc))) return;
    const [attempt] = await db.select({ score: quizAttempts.score, total: quizAttempts.total }).from(quizAttempts).where(and(eq(quizAttempts.userId, requester.id), eq(quizAttempts.documentId, doc.id))).orderBy(sql`${quizAttempts.at} desc`).limit(1);
    if (!attempt) return;
    const [duel] = await db.insert(quizDuels).values({ documentId: doc.id, challengerId: requester.id, invitedId: addresseeId, challengerScore: attempt.score, challengerTotal: attempt.total, expiresAt: new Date(Date.now() + DUEL_DAYS * 86_400_000) }).returning();
    await notify(addresseeId, { kind: "duel", title: `${requester.name} te défie sur un quiz`, body: doc.title, href: `/defi/${duel.id}` });
  }
}

async function accept(requesterId: string, addresseeId: string) {
  const [row] = await db.update(friendships).set({ status: "accepted", acceptedAt: new Date() })
    .where(and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, addresseeId), eq(friendships.status, "pending"))).returning();
  if (!row) return false;
  const [requester] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, requesterId));
  if (requester) await fulfil(requester, addresseeId, row.context);
  return true;
}

/** Code (A3F9C-1E7B2, a3f9c1e7b2), lien /amis?code=… ou adresse exacte. */
export async function requestFriend(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = String(form.get("who") ?? "").trim().slice(0, 300);
  if (!raw) return { error: "Indique le code de ton ami" };
  const key = `friend-request:${user.id}`;
  if (await rateLimited(key, 20, 1440)) return { error: "Trop de demandes aujourd’hui, réessaie demain" };
  await rateHit(key);
  const shared = raw.includes("/") ? new URLSearchParams(raw.split("?")[1] ?? "").get("code") ?? raw : raw;
  const value = shared.includes("@") ? shared : shared.replace(/[\s-]/g, "");
  const kind = form.get("contextKind");
  const contextId = String(form.get("contextId") ?? "").slice(0, 64);
  const context = (kind === "group" || kind === "duel" || kind === "revision" || kind === "course") && contextId ? { kind, id: contextId } as const : null;
  const [other] = await db.select({ id: users.id, status: users.status }).from(users)
    .where(value.includes("@") ? eq(users.email, value.toLowerCase()) : eq(users.friendCode, value.toUpperCase().slice(0, 10)));
  if (!other || other.status !== "active" || other.id === user.id || (await isBlockedBetween(user.id, other.id))) return { ok: SENT };
  const [existing] = await db.select().from(friendships).where(or(and(eq(friendships.requesterId, user.id), eq(friendships.addresseeId, other.id)), and(eq(friendships.requesterId, other.id), eq(friendships.addresseeId, user.id))));
  if (!existing) {
    const created = await db.insert(friendships).values({ requesterId: user.id, addresseeId: other.id, context }).onConflictDoNothing().returning();
    if (created.length) await notify(other.id, { kind: "friend", title: `${shortName(user.name)} te demande en ami`, href: "/amis" });
  } else if (existing.status === "pending" && existing.addresseeId === user.id) {
    // L'autre avait déjà demandé : les deux sont d'accord
    await accept(other.id, user.id);
    await notify(other.id, { kind: "friend", title: `${user.name} a accepté ta demande d’ami`, href: "/amis" });
  } else if (existing.status === "accepted" && context) {
    await fulfil(user, other.id, context);
  }
  forgetShellCounters(user.id, other.id);
  refresh();
  return { ok: SENT };
}

/** Variante formulaire (repli sans JavaScript). */
export async function answerFriend(form: FormData) {
  await answerFriendRequest(String(form.get("user")), form.get("answer") === "accept");
}

/** Accepter ou refuser sur place. Un refus reste silencieux : l'autre n'a pas à l'apprendre par une notification. */
export async function answerFriendRequest(rawOther: string, accepted: boolean) {
  const user = await requireUser();
  const other = z.uuid().parse(rawOther);
  if (accepted) {
    if (await accept(other, user.id)) await notify(other, { kind: "friend", title: `${user.name} a accepté ta demande d’ami`, href: "/amis" });
  } else {
    await db.update(friendships).set({ status: "refused" }).where(and(eq(friendships.requesterId, other), eq(friendships.addresseeId, user.id), eq(friendships.status, "pending")));
  }
  forgetShellCounters(user.id, other);
  refresh();
}

/** Retirer un ami ferme aussi ce que l'on partageait : révisions communes, défis et invitations. */
async function unlink(me: string, other: string) {
  await db.delete(friendships).where(or(and(eq(friendships.requesterId, me), eq(friendships.addresseeId, other)), and(eq(friendships.requesterId, other), eq(friendships.addresseeId, me))));
  await db.delete(revisionMembers).where(or(
    and(eq(revisionMembers.userId, other), sql`${revisionMembers.spaceId} in (select ${revisionSpaces.id} from ${revisionSpaces} where ${revisionSpaces.ownerId} = ${me})`),
    and(eq(revisionMembers.userId, me), sql`${revisionMembers.spaceId} in (select ${revisionSpaces.id} from ${revisionSpaces} where ${revisionSpaces.ownerId} = ${other})`),
  ));
  await db.delete(quizDuels).where(or(and(eq(quizDuels.challengerId, me), eq(quizDuels.invitedId, other)), and(eq(quizDuels.challengerId, other), eq(quizDuels.invitedId, me))));
  await db.delete(studyGroupMembers).where(or(
    and(eq(studyGroupMembers.userId, other), sql`${studyGroupMembers.groupId} in (select ${studyGroups.id} from ${studyGroups} where ${studyGroups.ownerId} = ${me})`),
    and(eq(studyGroupMembers.userId, me), sql`${studyGroupMembers.groupId} in (select ${studyGroups.id} from ${studyGroups} where ${studyGroups.ownerId} = ${other})`),
  ));
  forgetShellCounters(me, other);
  refresh();
}

export async function removeFriend(form: FormData) {
  const user = await requireUser();
  await unlink(user.id, z.uuid().parse(form.get("user")));
}

export async function removeFriendById(rawOther: string) {
  const user = await requireUser();
  await unlink(user.id, z.uuid().parse(rawOther));
}

/** Bloquer : plus d'amitié, de demande, de défi ni d'invitation, plus d'activité ni de profil, dans les deux sens. */
export async function blockUser(rawOther: string) {
  const user = await requireUser();
  const other = z.uuid().parse(rawOther);
  if (other === user.id) return;
  await unlink(user.id, other);
  await db.insert(schema.userBlocks).values({ blockerId: user.id, blockedId: other }).onConflictDoNothing();
  await db.delete(friendReactions).where(or(and(eq(friendReactions.actorId, user.id), eq(friendReactions.targetId, other)), and(eq(friendReactions.actorId, other), eq(friendReactions.targetId, user.id))));
  // Ni l'un ni l'autre ne reste abonné
  await db.delete(schema.profileFollows).where(or(and(eq(schema.profileFollows.followerId, user.id), eq(schema.profileFollows.followedId, other)), and(eq(schema.profileFollows.followerId, other), eq(schema.profileFollows.followedId, user.id))));
}

export async function unblockUser(rawOther: string) {
  const user = await requireUser();
  await db.delete(schema.userBlocks).where(and(eq(schema.userBlocks.blockerId, user.id), eq(schema.userBlocks.blockedId, z.uuid().parse(rawOther))));
  refresh();
}

export async function renewFriendCode() {
  const user = await requireUser();
  await db.update(users).set({ friendCode: sql`upper(substr(md5(gen_random_uuid()::text), 1, 10))` }).where(eq(users.id, user.id));
  refresh();
}

const INVITE_DAYS = 7;
const INVITE_USES = 5;

/** Un lien d'ami qui expire : 7 jours, 5 usages. Il ne révèle pas le code permanent. */
export async function createFriendInvite(): Promise<{ url: string; expiresAt: string } | { error: string }> {
  const user = await requireUser();
  const key = `friend-invite:${user.id}`;
  if (await rateLimited(key, 10, 1440)) return { error: "Trop de liens créés aujourd’hui" };
  await rateHit(key);
  const token = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  await db.insert(friendInvites).values({ token, userId: user.id, usesLeft: INVITE_USES, expiresAt });
  return { url: `${env.baseUrl}/amis?lien=${token}`, expiresAt: expiresAt.toISOString() };
}

/** Utiliser le lien d'un ami : l'amitié est faite des deux côtés (il a créé le lien, j'ai choisi de l'ouvrir). */
export async function acceptFriendInvite(rawToken: string): Promise<FormState> {
  const user = await requireUser();
  const token = z.string().regex(/^[\w-]{10,32}$/).safeParse(rawToken);
  const gone = { error: "Ce lien a expiré, demande-lui son code" };
  if (!token.success) return gone;
  const [peek] = await db.select().from(friendInvites).where(eq(friendInvites.token, token.data));
  if (!peek || peek.userId === user.id) return gone;
  const [invite] = await db.update(friendInvites).set({ usesLeft: sql`${friendInvites.usesLeft} - 1` })
    .where(and(eq(friendInvites.token, token.data), gt(friendInvites.usesLeft, 0), gt(friendInvites.expiresAt, new Date()))).returning();
  if (!invite) return gone;
  const [owner] = await db.select({ id: users.id, name: users.name, status: users.status }).from(users).where(eq(users.id, invite.userId));
  if (!owner || owner.status !== "active" || (await isBlockedBetween(user.id, owner.id))) return gone;
  if (!(await areFriends(user.id, owner.id))) {
    await db.delete(friendships).where(or(and(eq(friendships.requesterId, user.id), eq(friendships.addresseeId, owner.id)), and(eq(friendships.requesterId, owner.id), eq(friendships.addresseeId, user.id))));
    await db.insert(friendships).values({ requesterId: owner.id, addresseeId: user.id, status: "accepted", acceptedAt: new Date() }).onConflictDoNothing();
    await notify(owner.id, { kind: "friend", title: `${user.name} a rejoint tes amis par ton lien`, href: "/amis" });
  }
  forgetShellCounters(user.id, owner.id);
  refresh();
  return { ok: `${owner.name} est maintenant ton ami` };
}

/** Trois réactions fixes, pas de texte libre : impossible de s'en servir pour harceler. La même une deuxième fois la retire. */
export async function reactTo(rawTarget: string, eventKey: string, kind: "bravo" | "merci" | "courage") {
  const user = await requireUser();
  const target = z.uuid().parse(rawTarget);
  const key = z.string().regex(/^[\w:-]{3,64}$/).parse(eventKey);
  const reaction = z.enum(["bravo", "merci", "courage"]).parse(kind);
  if (!(await areFriends(user.id, target))) return null;
  const [existing] = await db.select().from(friendReactions).where(and(eq(friendReactions.actorId, user.id), eq(friendReactions.eventKey, key)));
  if (existing?.kind === reaction) {
    await db.delete(friendReactions).where(and(eq(friendReactions.actorId, user.id), eq(friendReactions.eventKey, key)));
    return null;
  }
  const limit = `react:${user.id}`;
  if (await rateLimited(limit, 200, 1440)) return existing?.kind ?? null;
  await rateHit(limit);
  await db.insert(friendReactions).values({ actorId: user.id, targetId: target, eventKey: key, kind: reaction })
    .onConflictDoUpdate({ target: [friendReactions.actorId, friendReactions.eventKey], set: { kind: reaction, at: new Date() } });
  return reaction;
}

/** Envoyer un cours à un ami : une notification avec le lien, aucune copie. Seulement s'il peut le lire. */
export async function sendCourse(rawFriend: string, rawDoc: string): Promise<{ ok: string } | { error: string }> {
  const user = await requireUser();
  const friendId = z.uuid().parse(rawFriend);
  const [doc] = await db.select().from(documents).where(eq(documents.id, z.uuid().parse(rawDoc)));
  const [friend] = await db.select().from(users).where(eq(users.id, friendId));
  if (!doc || !friend || !(await areFriends(user.id, friendId)) || !(await canRead(user, doc)) || !(await canRead(friend, doc))) return { error: "Ce cours ne peut pas lui être envoyé" };
  const key = `send-course:${user.id}`;
  if (await rateLimited(key, 30, 1440)) return { error: "Trop d’envois aujourd’hui" };
  await rateHit(key);
  await notify(friendId, { kind: "friend", title: `${user.name} t’envoie un cours`, body: doc.title, href: `/d/${doc.id}` });
  return { ok: `Envoyé à ${friend.name}` };
}
