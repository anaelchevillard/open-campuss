/** Mise en forme des indicateurs d'administration : pas de base ici, pour que tout se teste sans elle. */

export type Share = { n: number; total: number };

// En dessous, un pourcentage ferait croire à une tendance : on donne le compte brut
export const MIN_SHARE_SAMPLE = 20;
export const MIN_DELAY_SAMPLE = 5;
export const DELAY_TARGET_HOURS = 24;

const NBSP = "\u00a0";
export const percentOf = ({ n, total }: Share) => (total ? Math.round((n / total) * 100) : 0);

/** « 43 % » avec le compte en dessous, ou « 1 sur 2 » seul tant qu'il y a trop peu de monde. */
export function shareView(share: Share) {
  if (!share.total) return { value: null, detail: null, enough: false };
  const counted = `${share.n} sur ${share.total}`;
  return share.total >= MIN_SHARE_SAMPLE
    ? { value: `${percentOf(share)}${NBSP}%`, detail: counted, enough: true }
    : { value: counted, detail: null, enough: false };
}

export function formatDelay(seconds: number) {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}${NBSP}min`;
  if (seconds < 172_800) return `${Math.floor(seconds / 3600)}${NBSP}h`;
  return `${Math.floor(seconds / 86_400)}${NBSP}j`;
}

/** Atteint ou non, sur le chiffre affiché ; rien tant que le chiffre ne veut rien dire. */
export function shareReached(share: Share, target: number, enough = share.total >= MIN_SHARE_SAMPLE) {
  return enough && share.total > 0 ? percentOf(share) >= target : null;
}

export function delayReached(medianSeconds: number | null, count: number) {
  return medianSeconds !== null && count >= MIN_DELAY_SAMPLE ? medianSeconds < DELAY_TARGET_HOURS * 3600 : null;
}

export type CoverageRow = { programId: number; program: string; level: number; subjectId: number; subject: string; courses: number };

/** Il n'existe pas de liste officielle des chapitres : la couverture se lit matière par matière. */
export function coverageOf(rows: CoverageRow[]) {
  const programs: { id: number; name: string; levels: { level: number; share: Share; subjects: { id: number; name: string; courses: number }[] }[] }[] = [];
  for (const row of rows) {
    let program = programs.find((p) => p.id === row.programId);
    if (!program) programs.push(program = { id: row.programId, name: row.program, levels: [] });
    let level = program.levels.find((l) => l.level === row.level);
    if (!level) program.levels.push(level = { level: row.level, share: { n: 0, total: 0 }, subjects: [] });
    level.share.total += 1;
    if (row.courses > 0) level.share.n += 1;
    level.subjects.push({ id: row.subjectId, name: row.subject, courses: row.courses });
  }
  const firstYear = rows.filter((row) => row.level === 1);
  return { programs, firstYear: { n: firstYear.filter((row) => row.courses > 0).length, total: firstYear.length } };
}
