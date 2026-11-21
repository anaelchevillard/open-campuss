import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminHeader } from "@/components/admin/admin-header";
import { contextOf } from "@/components/admin/stats/context";
import { StatsFilters } from "@/components/admin/stats/filters";
import { AudienceView, OverviewView, RetentionView } from "@/components/admin/stats/views-people";
import { ContentView, ContributionView, CoverageView, RevisionView } from "@/components/admin/stats/views-content";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { Shell } from "@/components/shell";
import { filtersOf, periodOf, statsHref } from "@/lib/audience-calc";
import { filterChoices, filtered } from "@/lib/audience-queries";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Statistiques" };

const VIEWS = [
  ["ensemble", "Vue d’ensemble", OverviewView],
  ["audience", "Audience", AudienceView],
  ["retention", "Rétention", RetentionView],
  ["contenus", "Contenus", ContentView],
  ["revision", "Révision", RevisionView],
  ["contribution", "Contribution", ContributionView],
  ["couverture", "Couverture", CoverageView],
] as const;

const KEPT = ["jours", "licence", "annee", "matiere", "vue"] as const;
const day = (d: string, year = false) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });

/**
 * Statistiques d'administration : des totaux seulement, calculés sur la base du site ; rien ne
 * part chez un tiers. Réservé aux administrateurs (404 sinon, « voir comme » compris).
 */
export default async function StatsPage({ searchParams }: PageProps<"/admin/statistiques">) {
  const admin = await requireAdmin();
  const raw = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const kept = Object.fromEntries(KEPT.map((k) => [k, one(raw[k])])) as Record<(typeof KEPT)[number], string | undefined>;
  const f = filtersOf(kept);
  const p = periodOf(kept.jours);
  const view = VIEWS.find(([id]) => id === kept.vue) ?? VIEWS[0];
  const ctx = contextOf(f, p, (patch) => statsHref(kept, patch));
  const choices = await filterChoices(f);
  const subject = choices.subjects.find((s) => s.id === f.subjectId);
  const program = choices.programs.find((x) => x.id === f.programId);
  const scope = [program?.name, f.level ? `L${f.level}` : null, subject?.name].filter(Boolean).join(" · ");
  const View = view[2];
  return (
    <Shell user={admin} width="wide">
      <AdminHeader title="Statistiques" section="suivi" current="/admin/statistiques" program={false} />
      <div className="grid gap-6">
        <Suspense>
          <StatsFilters days={p.days} programId={f.programId} level={f.level} subjectId={f.subjectId} programs={choices.programs} subjects={choices.subjects} />
        </Suspense>
        <SegmentedTabs label="Vues des statistiques" value={view[0]} items={VIEWS.map(([id, label]) => ({ value: id, label, href: statsHref(kept, { vue: id === "ensemble" ? null : id }) }))} />
        <p className="-mt-2 text-sm text-muted-foreground">
          Du {day(p.current.from)} au {day(p.current.to, true)}, comparé au {day(p.previous.from)} – {day(p.previous.to, true)}.
          {filtered(f) && <> Filtre : <strong className="font-semibold text-foreground">{scope}</strong>. La licence et l’année filtrent les personnes ; licence, année et matière filtrent les cours.</>}
        </p>
        <View ctx={ctx} />
      </div>
    </Shell>
  );
}
