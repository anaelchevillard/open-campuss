import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { Suspense } from "react";
import { z } from "zod";
import { AdminHeader, adminProgram } from "@/components/admin/admin-header";
import { renderedAt } from "@/components/admin/badges";
import { CreateAccount } from "@/components/admin/create-account";
import { FilePanel } from "@/components/admin/file-panel";
import { PeopleView } from "@/components/admin/people-view";
import { FILE_TABS, PersonFile, type FileTab } from "@/components/admin/person-file";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { Shell } from "@/components/shell";
import { requireAdmin } from "@/lib/auth";
import { listPrograms } from "@/lib/catalog";
import { db, schema } from "@/lib/db";
import { inviters, listPeople, PEOPLE_PAGE } from "@/lib/admin-people";

export const metadata: Metadata = { title: "Personnes" };

const flat = (sp: Record<string, string | string[] | undefined>) => Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));

export default async function PeoplePage({ searchParams }: PageProps<"/admin/personnes">) {
  const admin = await requireAdmin();
  const sp = flat(await searchParams);
  const program = await adminProgram();
  const [data, programs, by] = await Promise.all([listPeople(sp, program), listPrograms(), inviters()]);
  const query = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    next.delete("page");
    const s = next.toString();
    return s ? `/admin/personnes?${s}` : "/admin/personnes";
  };
  const fiche = z.uuid().safeParse(sp.fiche).success ? sp.fiche! : null;
  const [person] = fiche ? await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, fiche)) : [];
  const vue = (FILE_TABS.some(([t]) => t === sp.vue) ? sp.vue : "apercu") as FileTab;
  const verifiedCount = data.rows.filter((r) => r.domain?.kind === "verified").length;
  return (
    <Shell user={admin} width="wide">
      <AdminHeader title="Personnes" section="personnes" current="/admin/personnes" action={<Suspense><CreateAccount programs={programs.map((p) => ({ id: p.id, name: p.name }))} defaultProgram={program} /></Suspense>} />
      <SegmentedTabs label="Comptes" value={data.tab} className="mb-4" items={[
        { value: "tous", label: "Tous", href: query({ onglet: null, fiche: null }) },
        { value: "attente", label: "En attente", count: data.counts.attente, href: query({ onglet: "attente", fiche: null }) },
        { value: "suspendus", label: "Suspendus", count: data.counts.suspendus, href: query({ onglet: "suspendus", fiche: null }) },
        { value: "staff", label: "Staff", href: query({ onglet: "staff", fiche: null }) },
      ]} />
      <Suspense>
        <PeopleView rows={data.rows} total={data.total} page={data.page} pageSize={PEOPLE_PAGE} tab={data.tab} programs={programs.map((p) => ({ id: p.id, name: p.name }))} inviters={by} verifiedCount={verifiedCount} now={renderedAt()} />
      </Suspense>
      {fiche && person && (
        <Suspense>
          <FilePanel title={`Fiche de ${person.name}`}>
            <PersonFile id={fiche} tab={vue} admin={admin} base={(tab) => query({ fiche, vue: tab === "apercu" ? null : tab })} />
          </FilePanel>
        </Suspense>
      )}
    </Shell>
  );
}
