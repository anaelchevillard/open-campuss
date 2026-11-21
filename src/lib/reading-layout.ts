/** Règles pures de la lecture et de l'écriture (testées sans navigateur). */

/** Paliers de la grille, en rem de largeur du conteneur `.doc-shell`. */
export const FRAME = { narrow: 48, notes: 73, wide: 103 } as const;

export type TocMode = "none" | "list" | "rail" | "fab";

/** Où vit le sommaire, selon la largeur du conteneur, le pointeur et la présence de notes. */
export function tocMode(width: number, coarse: boolean, notes: number, count: number): TocMode {
  if (count < 2 || !width || width < FRAME.narrow) return "none";
  if (width < FRAME.notes) return coarse ? "fab" : "rail";
  if (width < FRAME.wide) return notes ? "rail" : "list";
  return "list";
}

/**
 * Les notes vivent dans la marge de droite, toujours visibles, dès que la grille a une colonne à droite (48rem) :
 * colonne étroite jusqu'à 73rem, large au-delà. En dessous (téléphone), des pastilles qui ouvrent une feuille basse.
 */
export const notesInColumn = (width: number) => width >= FRAME.narrow;

/** Largeur de la colonne des notes, en rem. */
export const notesColumnWidth = (width: number) => (width >= FRAME.notes ? 16 : 14);

export const foldText = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Recherche du menu « / » : titre (n'importe où) ou alias (début), sans accents. */
export function matchesBlock(item: { title: string; aliases: string[] }, query: string) {
  const q = foldText(query.trim());
  if (!q) return true;
  return foldText(item.title).includes(q) || item.aliases.some((alias) => foldText(alias).startsWith(q));
}
