import "server-only";
import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { notify } from "@/lib/notify";

const { blogPosts, blogPostMeta, users } = schema;

/** Clé de stockage d'une image d'actualité : hors du préfixe files/, que le balayage des fichiers orphelins parcourt. */
export const blogKey = (fileId: string) => `blog/${fileId}`;

export const BLOG_IMAGE = /^\/actualites\/images\/[0-9a-f-]{36}$/;

/** Statut affiché d'une actualité. */
export function blogStatus(post: { published: boolean; scheduledAt: Date | null; pinned: boolean }): "draft" | "scheduled" | "published" | "pinned" {
  if (post.published) return post.pinned ? "pinned" : "published";
  return post.scheduledAt ? "scheduled" : "draft";
}

/** Prévient les étudiants une seule fois par actualité (centre de notifications, sans mail). */
export async function announcePost(postId: string) {
  const [row] = await db.select({ post: blogPosts, meta: blogPostMeta }).from(blogPosts).leftJoin(blogPostMeta, eq(blogPostMeta.postId, blogPosts.id)).where(eq(blogPosts.id, postId));
  if (!row?.post.published || !row.meta?.notify || row.meta.notifiedAt) return;
  await db.update(blogPostMeta).set({ notifiedAt: new Date() }).where(eq(blogPostMeta.postId, postId));
  const people = await db.select({ id: users.id }).from(users).where(eq(users.status, "active"));
  for (const person of people) await notify(person.id, { kind: "alert", title: row.post.title || "Nouvelle actualité", href: `/actualites/${postId}`, dedupeKey: `news:${postId}` });
}

/** Publication programmée : appelée par la boucle de boot.ts, publie ce dont l'heure est passée. */
export async function publishScheduledPosts(now = new Date()) {
  const due = await db.select({ id: blogPosts.id }).from(blogPosts).where(and(eq(blogPosts.published, false), isNotNull(blogPosts.scheduledAt), lte(blogPosts.scheduledAt, now)));
  if (!due.length) return 0;
  await db.update(blogPosts).set({ published: true, publishedAt: now, scheduledAt: null, updatedAt: now }).where(inArray(blogPosts.id, due.map((p) => p.id)));
  for (const post of due) await announcePost(post.id);
  return due.length;
}

/** Une image d'actualité se montre à tous si l'actualité est publiée, sinon seulement à l'administrateur. */
export async function blogFileVisible(fileId: string, admin: boolean) {
  const [row] = await db.select({ file: schema.blogFiles, published: blogPosts.published }).from(schema.blogFiles).innerJoin(blogPosts, eq(schema.blogFiles.postId, blogPosts.id)).where(eq(schema.blogFiles.id, fileId));
  if (!row) return null;
  return row.published || admin ? row.file : null;
}

