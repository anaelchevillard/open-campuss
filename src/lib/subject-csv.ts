/** Import de matières : lecture et aperçu sans base (testé). licence;année;matière;nom court;semestre */

export type SubjectCsvRow = { line: number; program: string; level: number; name: string; short: string; semester: number | null; status: "new" | "exists" | "invalid"; problem?: string };

export function parseSubjectCsv(text: string, existing: { program: string; level: number; semester: number | null; name: string }[]): SubjectCsvRow[] {
  const key = (p: string, l: number, s: number | null, n: string) => `${p.toLowerCase()}|${l}|${s ?? ""}|${n.toLowerCase()}`;
  const known = new Set(existing.map((e) => key(e.program, e.level, e.semester, e.name)));
  const rows: SubjectCsvRow[] = [];
  text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 501).forEach((line, index) => {
    if (index === 0 && /^licence/i.test(line)) return;
    const [program = "", annee = "", name = "", short = "", sem = ""] = line.split(/[;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const level = Number(/^L?([123])$/i.exec(annee)?.[1] ?? 0);
    const s = /^S?([1-6])$/i.exec(sem)?.[1];
    const semester = sem === "" || /^an/i.test(sem) ? null : s ? Number(s) : NaN;
    const row: SubjectCsvRow = { line: index + 1, program: program.slice(0, 80), level, name: name.split(/\s+/).join(" ").slice(0, 120), short: short.slice(0, 20), semester: Number.isNaN(semester) ? null : semester, status: "new" };
    if (!program || !level || !row.name) { row.status = "invalid"; row.problem = "Format : licence;L1;matière;nom court;S1"; }
    else if (Number.isNaN(semester) || (semester !== null && Math.ceil(semester / 2) !== level)) { row.status = "invalid"; row.problem = "Semestre hors de l’année"; }
    else if (known.has(key(row.program, level, row.semester, row.name))) row.status = "exists";
    known.add(key(row.program, level, row.semester, row.name));
    rows.push(row);
  });
  return rows;
}
