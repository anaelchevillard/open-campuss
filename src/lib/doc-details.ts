/** Ce qu'un cours doit dire de lui avant d'être envoyé en relecture ou publié (règle pure, la même au navigateur et au serveur). */

export type DetailKey = "title" | "subject" | "rights" | "chapter" | "semester" | "teacher";

/** Un partiel ou un projet n'a pas de chapitre. */
export const CHAPTERLESS: readonly string[] = ["partiel", "projet"];

export type DetailState = {
  title: string; subjectId: number | null; rights: string; category: string;
  chapter: number | null; semester: number | null; teacherName: string | null;
};

/**
 * Les détails manquants. Titre, matière et origine du contenu sont toujours demandés ; le semestre (l'année vient
 * de la matière), le chapitre et le nom de l'enseignant aussi, sauf pour un enseignant qui publie dans sa matière.
 * Un brouillon s'enregistre toujours incomplet : la règle ne s'applique qu'à l'envoi.
 */
export function missingDetails(doc: DetailState, { teacher }: { teacher: boolean }): DetailKey[] {
  const missing: DetailKey[] = [];
  if (!doc.title.trim()) missing.push("title");
  if (!doc.subjectId) missing.push("subject");
  if (doc.rights === "unknown") missing.push("rights");
  if (teacher) return missing;
  if (doc.subjectId && !doc.semester) missing.push("semester");
  if (!CHAPTERLESS.includes(doc.category) && !doc.chapter) missing.push("chapter");
  if (!doc.teacherName?.trim()) missing.push("teacher");
  return missing;
}

/**
 * Les champs que la fenêtre d'envoi affiche. Fixés à l'ouverture (ce qui manquait alors), complétés
 * par ce que le serveur signale encore à l'envoi, jamais retirés pendant la frappe : un champ démonté dès son premier
 * caractère ne gardait qu'une lettre. La règle (missingDetails) ne décide que du bouton et de l'envoi.
 */
export function askedDetails(asked: readonly DetailKey[], missing: readonly DetailKey[]): DetailKey[] {
  return [...asked, ...missing.filter((key) => !asked.includes(key))];
}
