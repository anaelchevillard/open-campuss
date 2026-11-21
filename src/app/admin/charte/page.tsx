import type { Metadata } from "next";
import { AiBadge } from "@/components/ai/ai-badge";
import { AiSurface } from "@/components/ai/ai-surface";
import { AiWorking } from "@/components/ai/ai-working";
import { DocCard, DocCardSkeleton, DocGrid } from "@/components/doc-card";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Logo } from "@/components/logo";
import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Stat } from "@/components/stat";
import { StatusBadge, type DocStatus } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Demos } from "@/app/admin/charte/demos";
import { requireAdmin } from "@/lib/auth";
import { IconAiScan, IconError, IconInfo, IconSuccess, IconWarning, IconFavorite } from "@/lib/icons";

export const metadata: Metadata = { title: "Charte" };

const ROLES: [string, string][] = [
  ["--background", "Fond"], ["--card", "Carte"], ["--popover", "Menu"], ["--dialog", "Dialogue"], ["--primary", "Action principale"], ["--brand-tint", "Élément actif"],
  ["--brand-text", "Texte de marque"], ["--muted-foreground", "Texte secondaire"], ["--border", "Bordure"], ["--input", "Bordure de champ"], ["--highlighter", "Surlignage"], ["--danger-solid", "Confirmation destructive"],
];
const SCALE = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
const STATES: [string, typeof IconSuccess, string][] = [["bg-success-tint text-success-foreground", IconSuccess, "Succès"], ["bg-warning-tint text-warning-foreground", IconWarning, "Attention"], ["bg-destructive-tint text-destructive-foreground", IconError, "Danger"], ["bg-info-tint text-info-foreground", IconInfo, "Info"]];
const STATUSES: DocStatus[] = ["draft", "tofix", "pending", "published", "postreview", "revision", "hidden", "trash"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="grid gap-4"><h2 className="heading">{title}</h2>{children}</section>;
}

/** Démonstration vivante de la charte (DESIGN.md) : chaque élément vient des vrais tokens et composants. */
export default async function CharterPage() {
  const user = await requireAdmin();
  const sample = { id: "00000000-0000-4000-8000-000000000000", title: "La séparation des pouvoirs chez Montesquieu", category: "cours" as const, chapter: 1, semester: 1, coverFileId: null, academicYear: "2026-2027", ratingAvg: 4.5, ratingCount: 12, readers: 214, subjectId: 3, subjectShort: "Constit" };
  return (
    <Shell user={user} width="wide">
      <PageHeader title="Charte" />
      <div className="grid gap-12">
        <Section title="Marque">
          <div className="flex h-24 items-center justify-center rounded-xl bg-card shadow-xs"><Logo className="h-7 w-auto" /></div>
          <div className="grid grid-cols-11 overflow-hidden rounded-xl shadow-xs">
            {SCALE.map((s) => <div key={s} className="grid h-16 content-end p-1.5 text-[0.6875rem] font-semibold" style={{ background: `var(--color-brand-${s})`, color: Number(s) >= 500 ? "var(--color-gray-0)" : "var(--color-brand-950)" }}>{s}</div>)}
          </div>
        </Section>
        <Section title="Rôles">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {ROLES.map(([v, label]) => (
              <li key={v} className="overflow-hidden rounded-xl bg-card shadow-xs">
                <div className="h-12 border-b border-border" style={{ background: `var(${v})` }} />
                <div className="p-3"><p className="text-sm font-semibold">{label}</p><p className="font-mono text-xs text-muted-foreground">{v}</p></div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {STATES.map(([k, icon, label]) => <span key={k} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${k}`}><Icon icon={icon} size={16} />{label}</span>)}
          </div>
        </Section>
        <Section title="Typographie">
          <div className="grid gap-3 rounded-xl bg-card p-6 shadow-xs">
            <p className="display">Display, page publique</p>
            <p className="title">Titre de page</p>
            <p className="heading">Titre de section</p>
            <p className="max-w-(--measure) text-pretty" data-reading>Texte de lecture à 18 px, interligne 1,7 : la police, l’espacement et la largeur suivent les réglages « Aa » de chacun.</p>
            <p>Interface à 16 px, <strong className="font-semibold">graisse 600</strong> pour l’emphase.</p>
            <p className="text-sm text-muted-foreground">Métadonnées à 14 px · 3 nov. · 1 240 lecteurs</p>
          </div>
        </Section>
        <Section title="Actions et retours">
          <Demos />
          <div className="grid max-w-sm gap-2"><Label htmlFor="champ">Champ</Label><Input id="champ" placeholder="Bordure à 3:1" /></div>
        </Section>
        <Section title="Statuts">
          <div className="flex flex-wrap gap-2">{STATUSES.map((s) => <StatusBadge key={s} status={s} />)}</div>
        </Section>
        <Section title="Chiffres">
          <div className="flex flex-wrap gap-10 rounded-xl bg-card p-6 shadow-xs"><Stat value="12" label="cours publiés" /><Stat value="1 240" label="lecteurs" /><Stat value="87 %" label="prêt pour le partiel" /></div>
        </Section>
        <Section title="Campuss IA">
          <div className="flex flex-wrap items-center gap-4"><AiBadge /></div>
          <div className="grid gap-4 md:grid-cols-2">
            <AiSurface><p>La séparation des pouvoirs repose sur trois fonctions : faire la loi, l’exécuter, juger.</p></AiSurface>
            <AiWorking label="Campuss IA transcrit…" />
          </div>
          <EmptyState variant="ai" icon={IconAiScan} title="Ajoute ton premier cours" description="Prends tes notes en photo, Campuss IA les met au propre" />
        </Section>
        <Section title="Cartes de cours">
          <DocGrid>
            <li><DocCard doc={sample} meta="Constit" favorite={false} href="#" /></li>
            <li><DocCard doc={{ ...sample, title: "" }} meta="Constit" status="tofix" href="#" /></li>
            <li><DocCardSkeleton /></li>
          </DocGrid>
          <EmptyState icon={IconFavorite} title="Aucun favori ici" description="L’étoile d’un cours le garde ici" />
        </Section>
      </div>
    </Shell>
  );
}
