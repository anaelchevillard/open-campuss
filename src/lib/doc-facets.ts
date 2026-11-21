import { folded } from "./content-utils";

const teacherKey = (name: string) => folded(name).replace(/\s+/g, " ").trim();

export const sameTeacher = (a: string, b: string) => teacherKey(a) === teacherKey(b);

/** « M. Dupont » et « m. dupont » ne font qu'une entrée, sous la première graphie rencontrée. */
export function teacherOptions(docs: { teacherName: string }[]) {
  const seen = new Map<string, string>();
  for (const { teacherName } of docs) {
    const key = teacherKey(teacherName);
    if (key && !seen.has(key)) seen.set(key, teacherName.trim());
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "fr"));
}

export const yearLabel = (year: string) => year.replace("-", "–");

export function yearOptions(docs: { academicYear: string }[]) {
  return [...new Set(docs.map((d) => d.academicYear).filter(Boolean))].sort().reverse();
}
