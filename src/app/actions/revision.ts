"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canRead } from "@/lib/access-server";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { areFriends } from "@/lib/friends";
import { notify } from "@/lib/notify";
import { purgeRevisionFiles, revisionFileIdsOfSpace } from "@/lib/purge";
import { rateHit, rateLimited } from "@/lib/security";
import { forgetShellCounters } from "@/lib/shell-cache";

const { revisionSpaces, revisionMembers, documents, users } = schema;
const uuid = z.uuid();

async function ownedSpace(raw: unknown) {
  const user = await requireUser();
  const [space] = await db.select().from(revisionSpaces).where(eq(revisionSpaces.id, uuid.parse(raw)));
  if (!space || space.ownerId !== user.id) throw new Error("accès refusé");
  return { user, space };
}

/** On n'invite que ses amis : personne ne reçoit d'invitation d'un inconnu, et personne ne parcourt la liste des inscrits. */
export async function inviteToRevision(form: FormData) {
  const user = await requireUser();
  const documentId = uuid.parse(form.get("document"));
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  const [other] = await db.select().from(users).where(eq(users.id, uuid.parse(form.get("user"))));
  if (!doc || doc.kind !== "editor" || !other || other.id === user.id || other.status !== "active") return;
  if (!(await canRead(user, doc)) || !(await canRead(other, doc)) || !(await areFriends(user.id, other.id))) return;
  const key = `revision-invite:${user.id}`;
  if (await rateLimited(key, 30, 1440)) return;
  await rateHit(key);
  await db.insert(revisionSpaces).values({ documentId, ownerId: user.id }).onConflictDoNothing();
  const [space] = await db.select({ id: revisionSpaces.id }).from(revisionSpaces).where(and(eq(revisionSpaces.documentId, documentId), eq(revisionSpaces.ownerId, user.id)));
  const [created] = await db.insert(revisionMembers).values({ spaceId: space.id, userId: other.id }).onConflictDoNothing().returning();
  forgetShellCounters(other.id);
  if (created) await notify(other.id, {
    kind: "revision_invite", title: `${user.name} t’invite à réviser`, body: doc.title, href: "/reviser",
    mail: { subject: "invitation à réviser", text: `${user.name} t’invite à réviser « ${doc.title} » ensemble.`, action: "Accepter ou refuser" },
  });
  revalidatePath(`/d/${documentId}`);
}

export async function removeFromRevision(form: FormData) {
  const { space } = await ownedSpace(form.get("space"));
  await db.delete(revisionMembers).where(and(eq(revisionMembers.spaceId, space.id), eq(revisionMembers.userId, uuid.parse(form.get("user")))));
  revalidatePath(`/d/${space.documentId}`);
}

export async function answerRevisionInvite(form: FormData) {
  const user = await requireUser();
  const spaceId = uuid.parse(form.get("space"));
  const accepted = form.get("answer") === "accept";
  const [updated] = await db.update(revisionMembers).set({ status: accepted ? "accepted" : "refused" }).where(and(eq(revisionMembers.spaceId, spaceId), eq(revisionMembers.userId, user.id), eq(revisionMembers.status, "pending"))).returning();
  if (!updated) return;
  forgetShellCounters(user.id);
  const [row] = await db.select({ ownerId: revisionSpaces.ownerId, title: documents.title, documentId: documents.id }).from(revisionSpaces).innerJoin(users, eq(revisionSpaces.ownerId, users.id)).innerJoin(documents, eq(revisionSpaces.documentId, documents.id)).where(eq(revisionSpaces.id, spaceId));
  if (row) await notify(row.ownerId, {
    kind: "revision_invite", title: `${user.name} a ${accepted ? "accepté" : "refusé"} de réviser avec toi`, body: row.title, href: `/d/${row.documentId}`,
    mail: { subject: "réponse à ton invitation", text: `${user.name} a ${accepted ? "accepté" : "refusé"} de réviser « ${row.title} » avec toi.` },
  });
  revalidatePath("/reviser");
  if (accepted && row) redirect(`/d/${row.documentId}?revision=${spaceId}`);
}

export async function leaveRevision(form: FormData) {
  const user = await requireUser();
  const spaceId = uuid.parse(form.get("space"));
  const [space] = await db.select({ documentId: revisionSpaces.documentId }).from(revisionSpaces).where(eq(revisionSpaces.id, spaceId));
  await db.delete(revisionMembers).where(and(eq(revisionMembers.spaceId, spaceId), eq(revisionMembers.userId, user.id)));
  redirect(space ? `/d/${space.documentId}` : "/reviser");
}

/** Tout effacer sur ce cours : marques, notes, photos et invitations. */
export async function deleteRevision(form: FormData) {
  const { space } = await ownedSpace(form.get("space"));
  // La cascade efface les lignes : les identifiants des photos se lisent avant
  const photos = await revisionFileIdsOfSpace(space.id);
  await db.delete(revisionSpaces).where(eq(revisionSpaces.id, space.id));
  await purgeRevisionFiles(photos);
  revalidatePath(`/d/${space.documentId}`);
}
