import { cn } from "cn";

/**
 * Le conteneur de page, le seul : largeur maximale, marges latérales et espacement haut et bas.
 * - `reading` : page d'un cours, d'un éditeur, d'une actualité. Pas de largeur maximale ici :
 *   la grille du cours (`DocFrame`) centre le texte à `--measure` et loge le sommaire et les notes dans ses marges.
 * - `standard` : toutes les autres pages (Accueil, Matières, Réviser, Amis, Demandes, Moi, Paramètres, Profil…), 64rem.
 * - `wide` : les outils de travail en tableaux ou en grilles denses (administration, À valider, Mes documents), 80rem.
 * Les pages ne rajoutent ni `mx-auto max-w-*` ni marge latérale autour de leur contenu ; une colonne plus étroite
 * (liste, formulaire) reste alignée à gauche du conteneur.
 */
export const PAGE_WIDTHS = { reading: "max-w-none", standard: "max-w-5xl", wide: "max-w-7xl" } as const;
export type PageWidth = keyof typeof PAGE_WIDTHS;

/** Marges latérales : 1rem au téléphone, 1,5rem dès 768 px, 2rem dès 1024 px (aussi pour un en-tête aligné sur la page). */
export const PAGE_GUTTER = "px-4 md:px-6 lg:px-8";
const PAGE_SPACING = "pt-4 pb-16 md:pt-6 md:pb-20";

/** Classes du conteneur ; `spacing: false` pour une bande (en-tête) qui doit seulement s'aligner sur la page. */
export function pageContainer(width: PageWidth = "standard", { spacing = true }: { spacing?: boolean } = {}) {
  return cn("mx-auto w-full min-w-0", PAGE_WIDTHS[width], PAGE_GUTTER, spacing && PAGE_SPACING);
}
