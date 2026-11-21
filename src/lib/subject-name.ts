/**
 * Nom d'une matière. Les matières portent un émoji en tête (« 🏭 Principes Économiques ») : on le garde là où le nom
 * est une étiquette (titre de la page de la matière, sélecteurs, cartes, listes), on le retire quand le nom est cité
 * dans une phrase (« Partiel de Principes Économiques », notifications, mails, textes d'aide, métadonnées).
 */

// Une suite d'émojis en tête : pictogrammes (drapeaux de sous-divisions compris, par leurs étiquettes), indicateurs
// régionaux (drapeaux), modificateurs de teinte, sélecteurs de variation, liaisons ZWJ, touches « 1️⃣ », espaces.
const LEADING_EMOJI = /^(?:[0-9#*]️?⃣|[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}︎️‍\u{E0020}-\u{E007F}]|\s)+/u;

export function subjectName(name: string | null | undefined, { emoji = true }: { emoji?: boolean } = {}): string {
  const full = (name ?? "").trim();
  if (emoji) return full;
  // Un nom fait seulement d'émojis reste tel quel plutôt que de disparaître
  return full.replace(LEADING_EMOJI, "").trim() || full;
}

/** Raccourci pour une phrase : `Partiel de ${inSentence(subject.name)}`. */
export const inSentence = (name: string | null | undefined) => subjectName(name, { emoji: false });
