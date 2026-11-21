import { asc, desc, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminHeader, adminProgram } from "@/components/admin/admin-header";
import { InvitationsView } from "@/components/admin/invitations-view";
import { Shell } from "@/components/shell";
import { requireAdmin } from "@/lib/auth";
import { listPrograms } from "@/lib/catalog";
import { db, schema } from "@/lib/db";
import { invitationState } from "@/lib/invitation-rules";
import { invitationsSentToday } from "@/lib/invitations";
import { getSetting } from "@/lib/site-settings";

export const metadata: Metadata = { title: "Invitations" };

export default async function InvitationsPage() {
  const admin = await requireAdmin();
  const [programs, program, rows, sentToday, limit, domains, subjects] = await Promise.all([
    listPrograms(), adminProgram(),
    db.select().from(schema.invitations).orderBy(desc(schema.invitations.createdAt)).limit(300),
    invitationsSentToday(), getSetting("mail.dailyLimit"), getSetting("registration.autoApproveDomains"),
    db.select({ id: schema.subjects.id, name: schema.subjects.name, level: schema.subjects.level, programId: schema.subjects.programId }).from(schema.subjects).where(isNull(schema.subjects.archivedAt)).orderBy(asc(schema.subjects.level), asc(schema.subjects.position)),
  ]);
  const queued = rows.filter((r) => invitationState(r) === "queued").length;
  return (
    <Shell user={admin} width="wide">
      <AdminHeader title="Invitations" section="personnes" current="/admin/invitations" />
      <Suspense>
        <InvitationsView
          programs={programs.map((p) => ({ id: p.id, name: p.name }))} defaultProgram={program} defaultDomain={domains[0] ?? ""} queue={{ queued, sentToday, limit }}
          subjects={subjects}
          rows={rows.map((r) => ({ id: r.id, email: r.email, name: r.name, programId: r.programId, level: r.level, uses: r.uses, maxUses: r.maxUses, domain: r.allowedDomain, state: invitationState(r), createdAt: r.createdAt.toISOString(), expiresAt: r.expiresAt.toISOString() }))}
        />
      </Suspense>
    </Shell>
  );
}
