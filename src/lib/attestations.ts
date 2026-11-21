export const ATTESTATIONS = {
  share: "Ce contenu est le mien, ou j’ai l’accord écrit de la personne à qui il appartient. Je reste responsable de ce que je publie.",
  ocr: "Ces notes sont les miennes, ou j’ai l’accord de la personne à qui elles appartiennent. Elles ne contiennent pas de données personnelles (nom, adresse, numéro d’étudiant…). Je reste responsable de cet envoi.",
  publish: "J’ai vérifié d’où vient ce contenu, et je ne vois aucune atteinte évidente aux droits de quelqu’un d’autre.",
  download: "Je consulte ce fichier pour mon usage personnel. Je m’engage à ne pas le rediffuser en dehors de Campuss.",
} as const;
export type AttestationKind = keyof typeof ATTESTATIONS;

/** Le rappel qui remplace la case une fois l'engagement accepté : même sens, à la deuxième personne. */
export const ATTESTATION_REMINDERS = {
  share: "En envoyant, tu confirmes que ce contenu est le tien ou que tu as l’accord écrit de la personne à qui il appartient, et que tu restes responsable de ce que tu publies.",
  ocr: "En envoyant, tu confirmes que ces notes sont les tiennes ou que tu as l’accord de la personne à qui elles appartiennent, qu’elles ne contiennent pas de données personnelles, et que tu restes responsable de cet envoi.",
  publish: "En publiant, tu confirmes avoir vérifié d’où vient ce contenu, et ne voir aucune atteinte évidente aux droits de quelqu’un d’autre.",
} as const;
export type RememberedKind = keyof typeof ATTESTATION_REMINDERS;

/**
 * La version découle du texte : changer un mot redemande l'engagement à tout le monde, sans étape à ne pas oublier.
 * Distincte de TERMS_VERSION, qui renverrait chacun accepter de nouveau toutes les conditions d'utilisation.
 */
export function attestationVersion(kind: AttestationKind) {
  let hash = 0x811c9dc5;
  for (const char of ATTESTATIONS[kind]) hash = Math.imul(hash ^ char.codePointAt(0)!, 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
