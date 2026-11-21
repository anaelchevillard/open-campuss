"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit, requireAdmin } from "@/lib/auth";
import { announcePost, blogKey } from "@/lib/blog";
import { blocksToMarkdown, sanitizeBlocks } from "@/lib/blocks";
import { courseText } from "@/lib/course";
import { db, schema } from "@/lib/db";
import { deleteKeys } from "@/lib/s3";

const { blogPosts, blogPostMeta } = schema;
const uuid = z.uuid();

/** « Nouvelle actualité » : un brouillon vide, ouvert aussitôt sur sa page finale. */
export async function createBlogDraft() {
  const admin = await requireAdmin();
  const [post] = await db.insert(blogPosts).values({ title: "", bodyMarkdown: "", bodyBlocks: [], authorId: admin.id }).returning({ id: blogPosts.id });
  await db.insert(blogPostMeta).values({ postId: post.id }).onConflictDoNothing();
  redirect(`/admin/actualites/${post.id}`);
}

/** Enregistrement automatique : le Markdown public est dérivé des blocs côté serveur. */
export async function saveBlogPost(rawId: string, rawTitle: string, rawBlocks: unknown): Promise<{ error?: string }> {
  await requireAdmin();
  const id = uuid.parse(rawId);
  const title = String(rawTitle ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const blocks = sanitizeBlocks(rawBlocks);
  const markdown = blocksToMarkdown(blocks);
  const excerpt = courseText(markdown).replace(/\s+/g, " ").trim().slice(0, 280);
  const [post] = await db.update(blogPosts).set({ title, bodyBlocks: blocks, bodyMarkdown: markdown, excerpt, updatedAt: new Date() }).where(eq(blogPosts.id, id)).returning({ published: blogPosts.published });
  if (!post) return { error: "Cette actualité n’existe plus." };
  if (post.published) revalidatePath(`/actualites/${id}`);
  return {};
}

const publishSchema = z.object({ notify: z.boolean(), pinned: z.boolean(), scheduledAt: z.iso.datetime({ offset: true }).nullable() });

/** Le seul bouton : publier maintenant ou à l'heure dite, épingler, prévenir les étudiants. */
export async function publishBlogPost(rawId: string, options: unknown): Promise<{ error?: string; scheduled?: boolean }> {
  const admin = await requireAdmin();
  const id = uuid.parse(rawId);
  const parsed = publishSchema.safeParse(options);
  if (!parsed.success) return { error: "Vérifie la date de publication." };
  const [post] = await db.select().from(blogPosts).where(eq(blogPosts.id, id));
  if (!post) return { error: "Cette actualité n’existe plus." };
  if (!post.title.trim()) return { error: "Donne un titre à l’actualité." };
  const when = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null;
  const later = when !== null && when.getTime() > Date.now() + 60_000;
  await db.insert(blogPostMeta).values({ postId: id, notify: parsed.data.notify }).onConflictDoUpdate({ target: blogPostMeta.postId, set: { notify: parsed.data.notify } });
  await db.update(blogPosts).set(later
    ? { scheduledAt: when, published: false, pinned: parsed.data.pinned, updatedAt: new Date() }
    : { published: true, publishedAt: post.publishedAt ?? new Date(), scheduledAt: null, pinned: parsed.data.pinned, updatedAt: new Date() }).where(eq(blogPosts.id, id));
  if (!later) await announcePost(id);
  await audit(admin.email, later ? "actualité_programmée" : "actualité_publiée", post.title);
  revalidatePath("/actualites");
  revalidatePath("/admin/actualites");
  return { scheduled: later };
}

export async function unpublishBlogPost(rawId: string) {
  const admin = await requireAdmin();
  const id = uuid.parse(rawId);
  await db.update(blogPosts).set({ published: false, scheduledAt: null, pinned: false, updatedAt: new Date() }).where(eq(blogPosts.id, id));
  await audit(admin.email, "actualité_dépubliée", id);
  revalidatePath("/actualites");
  revalidatePath("/admin/actualites");
}

export async function setBlogCover(rawId: string, fileId: string | null) {
  await requireAdmin();
  await db.update(blogPosts).set({ coverFileId: fileId === null ? null : uuid.parse(fileId), updatedAt: new Date() }).where(eq(blogPosts.id, uuid.parse(rawId)));
  revalidatePath(`/admin/actualites/${rawId}`);
}

export async function deleteBlogPost(form: FormData) {
  const admin = await requireAdmin();
  const id = uuid.parse(form.get("id"));
  const files = await db.select({ id: schema.blogFiles.id }).from(schema.blogFiles).where(eq(schema.blogFiles.postId, id));
  await db.delete(blogPosts).where(eq(blogPosts.id, id));
  await deleteKeys(files.map((f) => blogKey(f.id)));
  await audit(admin.email, "actualité_supprimée", id);
  revalidatePath("/admin/actualites");
  revalidatePath("/actualites");
  redirect("/admin/actualites");
}
