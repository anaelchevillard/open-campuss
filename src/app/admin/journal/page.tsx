import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminHeader } from "@/components/admin/admin-header";
import { JournalView } from "@/components/admin/journal-view";
import { Shell } from "@/components/shell";
import { journalAdmins, journalPage, JOURNAL_PAGE } from "@/lib/admin-journal";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Journal" };

/** Journal en lecture seule : rien ici ne modifie ni ne supprime une ligne. */
export default async function JournalPage({ searchParams }: PageProps<"/admin/journal">) {
  const admin = await requireAdmin();
  const sp = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const [{ rows, page, more }, admins] = await Promise.all([journalPage(sp), journalAdmins()]);
  return (
    <Shell user={admin} width="wide">
      <AdminHeader title="Journal" section="suivi" current="/admin/journal" program={false} />
      <Suspense>
        <JournalView admins={admins} page={page} more={more} pageSize={JOURNAL_PAGE}
          rows={rows.map((r) => ({ id: String(r.id), at: r.at.toISOString(), actor: r.actor, action: r.action, level: r.level, targetType: r.targetType, targetId: r.targetId, target: r.targetLabel || r.target, reason: r.reason, ip: r.ip, before: r.before ?? null, after: r.after ?? null, viewing: Boolean(r.impersonationId) }))} />
      </Suspense>
    </Shell>
  );
}
