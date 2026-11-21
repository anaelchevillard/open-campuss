import { IconCards, IconEdit, IconGoogleDocs, IconNotion, IconRequests, IconUpload, type IconData } from "@/lib/icons";

export type CreateOptions = { ai: boolean; notion: boolean; google: boolean; files: boolean };
export type CreateEntry = { href: string; icon: IconData; label: string };

/** Les entrées de « Commencer avec… » (le + et « Nouveau »), dans l'ordre fixe de DESIGN.md §5.4. Dans une matière, elle est préremplie. */
export function createEntries(options: CreateOptions, subject?: string): CreateEntry[] {
  const ctx = subject ? `&matiere=${subject}` : "";
  return [
    { href: `/contribuer/nouveau${subject ? `?matiere=${subject}` : ""}`, icon: IconEdit, label: "Écrire" },
    ...(options.notion ? [{ href: `/contribuer/nouveau?depart=notion${ctx}`, icon: IconNotion, label: "Importer de Notion" }] : []),
    ...(options.google ? [{ href: `/contribuer/nouveau?depart=google${ctx}`, icon: IconGoogleDocs, label: "Importer de Google Docs" }] : []),
    ...(options.files ? [{ href: `/contribuer/nouveau?depart=fichier${ctx}`, icon: IconUpload, label: "Fichier" }] : []),
    { href: `/demandes?nouvelle=1${ctx}`, icon: IconRequests, label: "Demander un cours" },
    { href: `/reviser/fiches?nouvelle=1${ctx}`, icon: IconCards, label: "Fiche mémo" },
  ];
}
