/** Motifs de renvoi, mêmes numéros partout (DESIGN.md §4.5). Fichier pur : lu par le serveur et par la file. */
export const REVIEW_REASONS = [
  "Origine à préciser", "Incomplet ou trop court", "Mauvaise matière ou type", "Mise en forme à reprendre",
  "Document protégé (polycopié, manuel)", "Données personnelles visibles", "Doublon de…",
] as const;

/** « Origine à préciser » : présélectionné quand l'origine d'un document n'est pas déclarée. */
export const REASON_ORIGIN = 1;

export const reasonLabel = (code: number | null | undefined) => (code && code >= 1 && code <= REVIEW_REASONS.length ? REVIEW_REASONS[code - 1] : null);

/** La note gardée sur le document (et lue par l'éditeur) : le motif, puis le mot du relecteur. */
export function reviewNoteOf(code: number | null | undefined, word: string) {
  const label = reasonLabel(code);
  const text = word.trim();
  if (label === "Doublon de…") return text ? `Doublon de ${text}` : "Doublon d’un document déjà publié";
  return [label, text].filter(Boolean).join(" : ").slice(0, 1000);
}
