import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { PageHeader } from "@/components/page-header";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { ProgramPicker } from "@/components/admin/program-picker";
import { listPrograms } from "@/lib/catalog";

export const ADMIN_PROGRAM_COOKIE = "campuss-admin-licence";

const SECTIONS = {
  contenus: [["/admin/contenus", "Cours"], ["/admin/moderation", "Modération"], ["/admin/licences", "Licences et matières"], ["/admin/actualites", "Actualités"], ["/admin/annonces", "Annonces"]],
  personnes: [["/admin/personnes", "Personnes"], ["/admin/invitations", "Invitations"]],
  suivi: [["/admin/suivi", "Vue d’ensemble"], ["/admin/statistiques", "Statistiques"], ["/admin/journal", "Journal"], ["/admin/erreurs", "Erreurs"], ["/admin/systeme", "Système"], ["/admin/reglages", "Réglages"]],
} as const;

/** Licence choisie dans l'en-tête de l'administration : filtre grilles, statistiques et files. */
export async function adminProgram() {
  const raw = Number((await cookies()).get(ADMIN_PROGRAM_COOKIE)?.value);
  return Number.isInteger(raw) && raw > 0 ? raw : null;
}

/**
 * En-tête des pages d'administration : titre, action, sélecteur de licence.
 * Les sous-sections de l'onglet ne s'affichent que sous 1024 px : au-dessus, la barre latérale
 * les liste déjà ; en dessous, c'est le seul chemin vers Modération, Licences, Actualités, Annonces, Invitations…
 */
export async function AdminHeader({ title, section, current, action, counts, program = true }: {
  title: string; section: keyof typeof SECTIONS; current: string; action?: ReactNode; counts?: Record<string, number>; program?: boolean;
}) {
  const [programs, chosen] = await Promise.all([listPrograms(), adminProgram()]);
  return (
    <PageHeader
      title={title}
      action={<>{program && programs.length > 1 && <ProgramPicker programs={programs.map((p) => ({ id: p.id, name: p.name }))} value={chosen} />}{action}</>}
      tabs={<SegmentedTabs className="lg:hidden" label="Sections" value={current} items={SECTIONS[section].map(([href, label]) => ({ value: href, label, href, count: counts?.[href] }))} />}
    />
  );
}
