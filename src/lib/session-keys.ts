/**
 * Raccourcis de la séance de fiches, inspirés d'Anki : logique pure, testée dans tests/fiches-seance.test.ts.
 */
export type SessionKeyAction =
  | { type: "flip" }
  | { type: "grade"; grade: 0 | 1 | 2 | 3 }
  | { type: "undo" }
  | { type: "edit" }
  | { type: "suspend" }
  | { type: "help" };

type KeyLike = { key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean };

/** Ce que fait une touche sur une fiche, selon qu'elle est retournée ou non ; null si la touche ne fait rien. */
export function sessionKeyAction(event: KeyLike, flipped: boolean): SessionKeyAction | null {
  const key = event.key;
  const mod = Boolean(event.ctrlKey || event.metaKey);
  if (mod) return key.toLowerCase() === "z" ? { type: "undo" } : null;
  if (key === "?") return { type: "help" };
  if (key === "z" || key === "Z") return { type: "undo" };
  if (key === "e" || key === "E") return { type: "edit" };
  if (key === "m" || key === "M") return { type: "suspend" };
  if (!flipped) return key === " " || key === "Enter" ? { type: "flip" } : null;
  // Réponse vue : Espace ou Entrée = Bien, comme dans Anki ; 1 à 4 = Raté, Difficile, Bien, Facile
  if (key === " " || key === "Enter") return { type: "grade", grade: 2 };
  const n = Number(key);
  return n >= 1 && n <= 4 ? { type: "grade", grade: (n - 1) as 0 | 1 | 2 | 3 } : null;
}

/** L'aide « ? » de la séance. */
export const SESSION_KEYS: { keys: string[]; label: string }[] = [
  { keys: ["Espace"], label: "Voir la réponse, puis « Bien »" },
  { keys: ["1", "2", "3", "4"], label: "Raté, Difficile, Bien, Facile" },
  { keys: ["Z"], label: "Annuler la dernière note" },
  { keys: ["E"], label: "Modifier la fiche" },
  { keys: ["M"], label: "Mettre la fiche de côté" },
  { keys: ["?"], label: "Afficher cette aide" },
];

/** Ce qui reste dans la séance : fiches à revoir, nouvelles, questions. */
export function remainingCounts(items: { kind: "card" | "new" | "question"; fresh?: boolean }[]) {
  let due = 0;
  let fresh = 0;
  let questions = 0;
  for (const item of items) {
    if (item.kind === "question") questions++;
    else if (item.kind === "new" || item.fresh) fresh++;
    else due++;
  }
  return { due, fresh, questions };
}
