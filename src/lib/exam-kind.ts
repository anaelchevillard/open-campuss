import { inSentence } from "@/lib/subject-name";

/**
 * Une annonce d'examen est un partiel ou un contrôle continu (CC). « Partiel » par défaut, pour
 * les annonces d'avant ce champ. Fonctions pures : rappels, plan du jour, widgets, mails et calendrier disent la même chose.
 */
export const EXAM_KINDS = { partiel: "Partiel", cc: "Contrôle continu (CC)" } as const;
export type ExamKind = keyof typeof EXAM_KINDS;

export const examKindOf = (value: unknown): ExamKind => (value === "cc" ? "cc" : "partiel");

/** Le mot court, en tête de phrase ou sur une étiquette : « Partiel », « CC ». */
export const examShort = (kind: ExamKind | string | null | undefined) => (examKindOf(kind) === "cc" ? "CC" : "Partiel");

// Élision devant une voyelle ou un h muet courant : « Partiel d’Économie », « CC d’Histoire »
const ELIDES = /^[aeiouyàâäéèêëîïôöùûüœæh]/i;

/** « de Microéconomie » / « d’Économie », sans l'émoji de la matière (le nom est cité dans une phrase). */
export function ofSubject(name: string | null | undefined) {
  const plain = inSentence(name);
  return ELIDES.test(plain) ? `d’${plain}` : `de ${plain}`;
}

/** « Partiel de Microéconomie », « CC d’Économie ». */
export const examPhrase = (kind: ExamKind | string | null | undefined, subject: string | null | undefined) => `${examShort(kind)} ${ofSubject(subject)}`;

/** Le même, en milieu de phrase : « le partiel de… », « le CC de… ». */
export const examInSentence = (kind: ExamKind | string | null | undefined, subject: string | null | undefined) =>
  `${examKindOf(kind) === "cc" ? "le CC" : "le partiel"} ${ofSubject(subject)}`;
