import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { CourseBody, courseToc } from "@/components/course-body";
import { Logo } from "@/components/logo";
import { pageContainer } from "@/components/page-container";
import { ReadingSettings } from "@/components/reading-settings";
import { DocFrame } from "@/components/reading/doc-frame";
import { Footer } from "@/components/shell";
import { db, schema } from "@/lib/db";
import { HOME } from "@/lib/home";

const load = cache(async (id: string) => {
  if (!z.uuid().safeParse(id).success) return null;
  const [row] = await db.select({ post: schema.blogPosts, author: schema.users.name }).from(schema.blogPosts).leftJoin(schema.users, eq(schema.users.id, schema.blogPosts.authorId)).where(eq(schema.blogPosts.id, id));
  return row?.post.published ? row : null;
});

export async function generateMetadata({ params }: PageProps<"/actualites/[id]">): Promise<Metadata> {
  const row = await load((await params).id);
  return row ? { title: row.post.title, description: row.post.excerpt || undefined } : { title: "Actualité" };
}

/** Une actualité, lue dans la même grille que les cours. */
export default async function BlogPostPage({ params }: PageProps<"/actualites/[id]">) {
  const row = await load((await params).id);
  if (!row) notFound();
  const { post } = row;
  return (
    <>
      <header className="border-b border-border bg-card">
        <div className={`${pageContainer("reading", { spacing: false })} flex items-center justify-between gap-3 py-2`}>
          <Link href={HOME} aria-label="Campuss" className="inline-flex min-h-11 items-center rounded-sm"><Logo className="h-6 w-auto" /></Link>
          <ReadingSettings />
        </div>
      </header>
      <main className={`flex-1 ${pageContainer("reading")}`}>
        <DocFrame items={courseToc(post.bodyMarkdown)} stickyTop="1rem">
          <article>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {post.coverFileId && <img src={`/actualites/images/${post.coverFileId}`} alt="" fetchPriority="high" className="mb-6 aspect-[3/1] w-full rounded-xl object-cover" />}
            <p className="text-sm font-semibold text-brand-text"><Link href="/actualites" className="hover-ok:underline">Actualités</Link></p>
            <h1 className="title mt-1 wrap-break-word">{post.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{[row.author, post.publishedAt?.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })].filter(Boolean).join(" · ")}</p>
            <div className="mt-8"><CourseBody markdown={post.bodyMarkdown} /></div>
          </article>
        </DocFrame>
      </main>
      <Footer />
    </>
  );
}
