import { and, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { LegalShell } from "@/components/legal-shell";
import { db, schema } from "@/lib/db";
import { IconPin } from "@/lib/icons";

export const metadata: Metadata = { title: "Actualités", description: "Les nouveautés de Campuss." };

export default async function BlogPage() {
  const posts = await db.select().from(schema.blogPosts).where(and(eq(schema.blogPosts.published, true))).orderBy(desc(schema.blogPosts.pinned), desc(schema.blogPosts.publishedAt)).limit(50);
  return (
    <LegalShell title="Actualités">
      {posts.length ? (
        <ul className="stagger !m-0 grid !list-none gap-4 !p-0 [grid-template-columns:repeat(auto-fill,minmax(min(100%,18rem),1fr))]">
          {posts.map((post) => (
            <li key={post.id} className="!m-0">
              <Link href={`/actualites/${post.id}`} className="flex h-full flex-col overflow-hidden rounded-xl bg-card !no-underline shadow-xs transition-[translate,box-shadow] duration-(--dur-base) hover-ok:shadow-sm hover-ok:motion-ok:-translate-y-0.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {post.coverFileId && <img src={`/actualites/images/${post.coverFileId}`} alt="" loading="lazy" className="aspect-[16/7] w-full object-cover" />}
                <span className="flex flex-1 flex-col gap-1.5 p-4">
                  <span className="card-title line-clamp-2 text-base font-semibold text-foreground">{post.title}</span>
                  {post.excerpt && <span className="line-clamp-3 text-sm text-muted-foreground">{post.excerpt}</span>}
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-1 text-sm text-muted-foreground">{post.pinned && <Icon icon={IconPin} size={16} className="size-3.5 text-brand-text" />}{post.publishedAt?.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="text-muted-foreground">Aucune actualité pour l’instant</p>}
    </LegalShell>
  );
}
