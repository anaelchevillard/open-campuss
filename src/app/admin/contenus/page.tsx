import { asc, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { renderedAt } from "@/components/admin/badges";
import { Suspense } from "react";
import { AdminHeader, adminProgram } from "@/components/admin/admin-header";
import { ContentsView } from "@/components/admin/contents-view";
import { Icon } from "@/components/icon";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { Shell } from "@/components/shell";
import { statusOf } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { CONTENT_PAGE, listContents } from "@/lib/admin-contents";
import { requireAdmin } from "@/lib/auth";
import { listPrograms } from "@/lib/catalog";
import { db, schema } from "@/lib/db";
import { CATEGORIES } from "@/lib/db/categories";
import { IconAdd } from "@/lib/icons";

export const metadata: Metadata = { title: "Contenus" };

export default async function ContentsPage({ searchParams }: PageProps<"/admin/contenus">) {
  const admin = await requireAdmin();
  const sp = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const program = await adminProgram();
  const [data, programs, subjects] = await Promise.all([
    listContents(sp, program), listPrograms(),
    db.select({ id: schema.subjects.id, name: schema.subjects.name, programId: schema.subjects.programId, level: schema.subjects.level }).from(schema.subjects).where(isNull(schema.subjects.archivedAt)).orderBy(asc(schema.subjects.level), asc(schema.subjects.position)),
  ]);
  return (
    <Shell user={admin} width="wide">
      <AdminHeader title="Contenus" section="contenus" current="/admin/contenus" action={<Link href="/admin/documents/new" data-slot="button" className={buttonVariants({ variant: "outline" })}><Icon icon={IconAdd} size={16} />Document technique</Link>} />
      <SegmentedTabs label="Contenus" value={data.trash ? "corbeille" : "cours"} className="mb-4" items={[
        { value: "cours", label: "Cours", href: "/admin/contenus" },
        { value: "corbeille", label: "Corbeille", count: data.trashed, href: "/admin/contenus?onglet=corbeille" },
      ]} />
      <Suspense>
        <ContentsView now={renderedAt()} trash={data.trash} total={data.total} page={data.page} pageSize={CONTENT_PAGE}
          programs={programs.map((p) => ({ id: p.id, name: p.name }))} subjects={subjects.filter((s) => !program || s.programId === program)}
          categories={Object.entries(CATEGORIES).map(([value, label]) => ({ value, label }))}
          rows={data.rows.map((r) => ({ ...r, status: statusOf(r), categoryLabel: CATEGORIES[r.category] }))} />
      </Suspense>
    </Shell>
  );
}
