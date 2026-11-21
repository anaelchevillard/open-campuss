import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { BlogEditor } from "@/components/editor/blog-editor";
import { Shell } from "@/components/shell";
import { requireAdmin } from "@/lib/auth";
import { markdownToBlocks } from "@/lib/blocks";
import { db, schema } from "@/lib/db";

export const metadata: Metadata = { title: "Actualité" };

/** L'actualité s'écrit sur sa page publique, rendue éditable. */
export default async function EditBlogPage({ params }: PageProps<"/admin/actualites/[id]">) {
  const admin = await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [row] = await db.select({ post: schema.blogPosts, meta: schema.blogPostMeta, author: schema.users.name }).from(schema.blogPosts)
    .leftJoin(schema.blogPostMeta, eq(schema.blogPostMeta.postId, schema.blogPosts.id)).leftJoin(schema.users, eq(schema.users.id, schema.blogPosts.authorId))
    .where(eq(schema.blogPosts.id, id));
  if (!row) notFound();
  const { post } = row;
  return (
    <Shell user={admin} width="reading">
      <BlogEditor id={post.id} title={post.title} initial={post.bodyBlocks?.length ? post.bodyBlocks : markdownToBlocks(post.bodyMarkdown)} coverFileId={post.coverFileId}
        published={post.published} pinned={post.pinned} notify={row.meta?.notify ?? false} scheduledAt={post.scheduledAt?.toISOString() ?? null} author={row.author ?? admin.name} />
    </Shell>
  );
}
