import { desc } from "drizzle-orm";
import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/admin-header";
import { AnnouncementsEditor } from "@/components/admin/announcements-editor";
import { Shell } from "@/components/shell";
import { requireAdmin } from "@/lib/auth";
import { listPrograms } from "@/lib/catalog";
import { db, schema } from "@/lib/db";

export const metadata: Metadata = { title: "Annonces" };

export default async function AnnouncementsPage() {
  const admin = await requireAdmin();
  const [rows, programs] = await Promise.all([db.select().from(schema.announcements).orderBy(desc(schema.announcements.createdAt)).limit(50), listPrograms()]);
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  return (
    <Shell user={admin} width="wide">
      <AdminHeader title="Annonces" section="contenus" current="/admin/annonces" program={false} />
      <AnnouncementsEditor programs={programs.map((p) => ({ id: p.id, name: p.name }))} rows={rows.map((a) => ({
        id: a.id, body: a.body, href: a.href ?? "", tone: a.tone, dismissible: a.dismissible, programIds: a.audience.programIds ?? [], levels: a.audience.levels ?? [], roles: a.audience.roles ?? [],
        startsAt: iso(a.startsAt), endsAt: iso(a.endsAt), live: a.startsAt <= new Date() && (!a.endsAt || a.endsAt > new Date()), endsAtRaw: a.endsAt?.toISOString() ?? null,
      }))} />
    </Shell>
  );
}
