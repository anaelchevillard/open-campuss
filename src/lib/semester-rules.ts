/** Semestres sans base de données : utilisable côté client (sélecteur S1 | S2) comme côté serveur. */
export type Parity = 1 | 2;
export const SEMESTER_COOKIE = "campuss-semestre";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** L'année universitaire commence le 15 août : avant, on est encore dans la précédente. */
export function academicYearOf(date: Date) {
  const start = date.getMonth() > 7 || (date.getMonth() === 7 && date.getDate() >= 15) ? date.getFullYear() : date.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

/** Calendrier par défaut : S1 du 15 août au 14 janvier, S2 du 15 janvier au 14 août. */
export function defaultTerms(date: Date) {
  const academicYear = academicYearOf(date);
  const first = Number(academicYear.slice(0, 4));
  return { academicYear, s1: `${first}-08-15`, s2: `${first + 1}-01-15` };
}

/** Parité d'une date selon les débuts de semestre (AAAA-MM-JJ). */
export function parityAt(date: Date, terms: { s1: string; s2: string }): Parity {
  const day = iso(date);
  return day >= terms.s2 || day < terms.s1 ? 2 : 1;
}

/** L1 S1 = 1, L1 S2 = 2, L2 S1 = 3… */
export const absoluteSemester = (level: number, parity: Parity) => 2 * level - 2 + parity;
export const parityOfSemester = (semester: number): Parity => (semester % 2 === 1 ? 1 : 2);
export const semesterLabel = (level: number, parity: Parity) => `L${level} · S${absoluteSemester(level, parity)}`;

/** Un partiel dans les 21 jours l'emporte sur la date : on révise le semestre qui finit, pas celui qui commence. */
export function pickParity(now: Date, terms: { s1: string; s2: string }, nextExam?: { at: Date; parity: Parity } | null): Parity {
  if (nextExam && nextExam.at.getTime() >= now.getTime() && nextExam.at.getTime() - now.getTime() <= 21 * 86_400_000) return nextExam.parity;
  return parityAt(now, terms);
}

/** Ce que l'utilisateur a choisi (URL puis cookie), sinon le semestre courant. */
export function chosenParity(query: string | string[] | undefined, cookie: string | undefined, current: Parity): Parity {
  const raw = Array.isArray(query) ? query[0] : query ?? cookie;
  return raw === "1" || raw === "2" ? Number(raw) as Parity : current;
}
