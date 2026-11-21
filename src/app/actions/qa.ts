"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canModerate } from "@/lib/access";
import { canRead } from "@/lib/access-server";
import { audit, requireModerator, requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { notifyAdmins } from "@/lib/mail";
import { adminMails } from "@/lib/mail/catalog";
import { notify } from "@/lib/notify";
import { qaReplyNotification } from "@/lib/reminders/qa-reply";
import { rateHit, rateLimited } from "@/lib/security";
import type { FormState } from "@/components/action-form";

const { documents, qaPosts, reports } = schema;

const uuid = z.uuid();

const str = (form: FormData, name: string, max = 4000) => { const v = form.get(name); return typeof v === "string" ? v.trim().slice(0, max) : ""; };

async function readable(rawId: unknown) {
  const user = await requireUser();
  const [doc] = await db.select().from(documents).where(eq(documents.id, uuid.parse(rawId)));
  if (!doc || !(await canRead(user, doc))) throw new Error("accès refusé");
  return { user, doc };
}

export async function postQuestion(_: FormState, form: FormData): Promise<FormState> {
  const { user, doc } = await readable(form.get("document"));
  const body = str(form, "body", 4000);
  if (body.length < 3) return { error: "Écris ton message." };
  const key = `qa:${user.id}`;
  if (await rateLimited(key, 30, 60)) return { error: "Trop de messages. Réessaie plus tard." };
  await rateHit(key);
  const parentId = form.get("parent") ? uuid.parse(form.get("parent")) : null;
  const [parent] = parentId ? await db.select().from(qaPosts).where(and(eq(qaPosts.id, parentId), eq(qaPosts.documentId, doc.id))) : [];
  if (parentId && !parent) return { error: "Question introuvable." };
  await db.insert(qaPosts).values({ documentId: doc.id, parentId, authorId: user.id, body });
  const reply = parent ? qaReplyNotification({ askerId: parent.authorId, replierId: user.id, docId: doc.id, docTitle: doc.title }) : null;
  if (reply) await notify(parent.authorId!, { ...reply, mail: { subject: "réponse à ta question", text: `Quelqu’un a répondu à ta question sur « ${doc.title} ».`, action: "Lire la réponse" } });
  revalidatePath(`/d/${doc.id}`);
  return { ok: "Message publié." };
}

async function post(rawId: unknown) {
  const [row] = await db.select({ post: qaPosts, doc: documents }).from(qaPosts).innerJoin(documents, eq(qaPosts.documentId, documents.id)).where(eq(qaPosts.id, uuid.parse(rawId)));
  if (!row) throw new Error("message introuvable");
  return row;
}

export async function reportPost(form: FormData) {
  const user = await requireUser();
  const row = await post(form.get("id"));
  if (!(await canRead(user, row.doc))) throw new Error("accès refusé");
  await db.insert(reports).values({ kind: "other", documentId: row.doc.id, reporterId: user.id, name: user.name, email: user.email, message: `Message signalé : ${row.post.body}`.slice(0, 4000), postId: row.post.id });
  // Masqué à partir de 3 signalements distincts, en attendant un modérateur
  const others = await db.select({ r: reports.reporterId }).from(reports).where(and(eq(reports.postId, row.post.id), eq(reports.status, "open")));
  if (new Set(others.map((o) => o.r)).size >= env.reportHideThreshold) await db.update(qaPosts).set({ hidden: true }).where(eq(qaPosts.id, row.post.id));
  await notifyAdmins(adminMails.messageReported(row.doc.id));
  revalidatePath(`/d/${row.doc.id}`);
}

export async function moderatePost(form: FormData) {
  const user = await requireModerator();
  const row = await post(form.get("id"));
  if (!canModerate(user, row.doc)) throw new Error("accès refusé");
  await db.update(qaPosts).set({ hidden: !row.post.hidden }).where(eq(qaPosts.id, row.post.id));
  await audit(user.email, row.post.hidden ? "message_rétabli" : "message_masqué", row.post.body.slice(0, 200));
  revalidatePath(`/d/${row.doc.id}`);
}

export async function acceptAnswer(form: FormData) {
  const user = await requireUser();
  const row = await post(form.get("id"));
  if (!row.post.parentId) return;
  const [question] = await db.select().from(qaPosts).where(eq(qaPosts.id, row.post.parentId));
  if (question?.authorId !== user.id && !canModerate(user, row.doc)) throw new Error("accès refusé");
  await db.update(qaPosts).set({ accepted: !row.post.accepted }).where(eq(qaPosts.id, row.post.id));
  revalidatePath(`/d/${row.doc.id}`);
}
