import { inSentence } from "@/lib/subject-name";

// Une fiche ou un partiel n'est pas annoncé comme « un nouveau cours »
const NEW_ONE: Record<string, string> = { cours: "Nouveau cours", td: "Nouveau TD", fiche: "Nouvelle fiche", partiel: "Nouveau sujet de partiel", projet: "Nouveau projet" };
const NEW_MANY: Record<string, string> = { cours: "nouveaux cours", td: "nouveaux TD", fiche: "nouvelles fiches", partiel: "nouveaux sujets de partiels", projet: "nouveaux projets" };

export type NewDoc = { id: string; title: string; category: string; subjectId: number; subject: string; level: number; programId: number; authors: string[] };
export type Student = { id: string; programId: number; level: number };

/** Ses matières uniquement, sans ses propres cours : un rappel par matière, pas un par document. */
export function newCourseNotifications(docs: NewDoc[], student: Student, day: string) {
  const bySubject = new Map<number, NewDoc[]>();
  for (const doc of docs) {
    if (doc.programId !== student.programId || doc.level !== student.level || doc.authors.includes(student.id)) continue;
    bySubject.set(doc.subjectId, [...(bySubject.get(doc.subjectId) ?? []), doc]);
  }
  return [...bySubject.entries()].map(([subjectId, group]) => {
    const category = group.every((doc) => doc.category === group[0].category) ? group[0].category : null;
    const name = inSentence(group[0].subject);
    const typed = category !== null && category in NEW_ONE;
    return {
      kind: "new_course" as const,
      title: group.length === 1 ? (typed ? `${NEW_ONE[category]} en ${name}` : `Du nouveau en ${name}`) : typed ? `${group.length} ${NEW_MANY[category]} en ${name}` : `${group.length} nouveautés en ${name}`,
      body: group.map((doc) => doc.title).join(", ").slice(0, 500),
      href: group.length === 1 ? `/d/${group[0].id}` : `/matieres/${subjectId}`,
      dedupeKey: `new_course:${subjectId}:${day}`,
    };
  });
}
