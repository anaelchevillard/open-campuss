import { desc } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { createBlogDraft } from "@/app/actions/blog";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/reui/badge";
import { Shell } from "@/components/shell";
import { Submit } from "@/components/submit";
import { requireAdmin } from "@/lib/auth";
import { blogStatus } from "@/lib/blog";
import { db, schema } from "@/lib/db";
import { IconAdd, IconCalendar, IconDraft, IconNews, IconPin, IconPublished, type IconData } from "@/lib/icons";

export const metadata: Metadata = { title: "Actualités" };

const STATUS: Record<ReturnType<typeof blogStatus>, { label: string; variant: "secondary" | "info-light" | "success-light" | "primary-light"; icon: IconData }> = {
  draft: { label: "Brouillon", variant: "secondary", icon: IconDraft },
  scheduled: { label: "Programmée", variant: "info-light", icon: IconCalendar },
  published: { label: "Publiée", variant: "success-light", icon: IconPublished },
  pinned: { label: "Épinglée", variant: "primary-light", icon: IconPin },
};

const short = (date: Date | null) => (date ? date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");

export default async function AdminBlogPage() {
  const admin = await requireAdmin();
  const posts = await db.select().from(schema.blogPosts).orderBy(desc(schema.blogPosts.pinned), desc(schema.blogPosts.updatedAt));
  const create = <form action={createBlogDraft}><Submit><Icon icon={IconAdd} />Nouvelle actualité</Submit></form>;
  return (
    <Shell user={admin} width="wide">
      <PageHeader title="Actualités" action={create} />
      {posts.length ? (
        <ul className="stagger mt-6 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,18rem),1fr))]">
          {posts.map((post) => {
            const status = STATUS[blogStatus(post)];
            return (
              <li key={post.id}>
                <Link href={`/admin/actualites/${post.id}`} className="group flex h-full flex-col overflow-hidden rounded-xl bg-card shadow-xs transition-[translate,box-shadow] duration-(--dur-base) hover-ok:shadow-sm hover-ok:motion-ok:-translate-y-0.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {post.coverFileId && <img src={`/actualites/images/${post.coverFileId}`} alt="" loading="lazy" className="aspect-[16/7] w-full object-cover" />}
                  <span className="flex flex-1 flex-col gap-2 p-4">
                    <span className="card-title line-clamp-2 font-semibold">{post.title || "Sans titre"}</span>
                    {post.excerpt && <span className="line-clamp-2 text-sm text-muted-foreground">{post.excerpt}</span>}
                    <span className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-sm text-muted-foreground">
                      <Badge variant={status.variant} radius="full" className="gap-1"><Icon icon={status.icon} size={16} className="size-3.5" />{status.label}</Badge>
                      {short(post.scheduledAt && !post.published ? post.scheduledAt : post.publishedAt ?? post.updatedAt)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : <EmptyState icon={IconNews} title="Aucune actualité" action={create} />}
    </Shell>
  );
}
