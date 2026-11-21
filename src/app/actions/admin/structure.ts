"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminFor, isStepUp, reasonOf, type AdminResult } from "@/lib/admin-ops";
import { auditAction } from "@/lib/audit";
import { folded } from "@/lib/content-utils";
import { db, schema } from "@/lib/db";
import { parseSubjectCsv, type SubjectCsvRow } from "@/lib/subject-csv";
import { forgetAllShellCounters } from "@/lib/shell-cache";

const { subjects, programs, documents } = schema;
const done = () => { forgetAllShellCounters(); revalidatePath("/admin/licences"); revalidatePath("/", "layout"); };
const slugOf = (name: string) => folded(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const shortOf = (name: string, short: string) => (short.trim() || name).slice(0, 20);

async function subjectOf(id: number) {
  const [row] = await db.select().from(subjects).where(eq(subjects.id, id));
  return row ?? null;
}
const label = (s: { id: number; name: string }) => ({ type: "subject" as const, id: s.id, label: s.name });

export async function createProgram(name: string): Promise<AdminResult<number>> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const clean = name.trim().slice(0, 80);
  const slug = slugOf(clean);
  if (!slug) return { error: "Indique le nom de la licence." };
  const [row] = await db.insert(programs).values({ name: clean, slug }).onConflictDoNothing().returning();
  if (!row) return { error: "Cette licence existe déjà." };
  await auditAction(admin, { action: "licence.creee", target: { type: "program", id: row.id, label: clean } });
  done();
  return { data: row.id };
}

/** Ouvrir ou fermer une licence aux inscriptions : sensible. */
export async function setProgramOpen(id: number, active: boolean, reason: string): Promise<AdminResult> {
  const admin = await adminFor("sensitive");
  if (isStepUp(admin)) return admin;
  const motive = reasonOf(reason);
  const [row] = await db.update(programs).set({ active }).where(eq(programs.id, z.number().int().parse(id))).returning();
  if (row) await auditAction(admin, { action: "licence.ouverte", target: { type: "program", id: row.id, label: row.name }, reason: motive, after: { active } });
  done();
  return {};
}

export async function addSubject(programId: number, level: number, name: string, semester: number | null): Promise<AdminResult<number>> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const clean = name.split(/\s+/).join(" ").trim().slice(0, 120);
  if (!clean) return { error: "Indique le nom de la matière." };
  if (![1, 2, 3].includes(level) || (semester !== null && (semester < 1 || semester > 6))) return { error: "Année ou semestre invalide." };
  const [last] = await db.select({ max: sql<number>`coalesce(max(${subjects.position}), 0)::int` }).from(subjects).where(and(eq(subjects.programId, programId), eq(subjects.level, level)));
  const [row] = await db.insert(subjects).values({ programId, level, name: clean, shortName: shortOf(clean, ""), semester, position: (last?.max ?? 0) + 1 }).onConflictDoNothing().returning();
  if (!row) return { error: "Cette matière existe déjà." };
  await auditAction(admin, { action: "matiere.creee", target: label(row), after: { semester } });
  done();
  return { data: row.id };
}

/** Renommer, nom court, semestre (S1 · S2 · annuelle) : courant, sur place. */
export async function updateSubject(id: number, patch: { name?: string; shortName?: string; semester?: number | null }): Promise<AdminResult> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const before = await subjectOf(id);
  if (!before) return { error: "Matière introuvable." };
  const set: Partial<typeof subjects.$inferInsert> = {};
  if (patch.name !== undefined) {
    const clean = patch.name.split(/\s+/).join(" ").trim().slice(0, 120);
    if (!clean) return { error: "Le nom ne peut pas être vide." };
    set.name = clean;
  }
  if (patch.shortName !== undefined) set.shortName = shortOf(set.name ?? before.name, patch.shortName);
  if (patch.semester !== undefined) {
    if (patch.semester !== null && (patch.semester < 1 || patch.semester > 6 || Math.ceil(patch.semester / 2) !== before.level)) return { error: "Semestre hors de cette année." };
    set.semester = patch.semester;
  }
  try {
    await db.update(subjects).set(set).where(eq(subjects.id, id));
  } catch {
    return { error: "Une matière porte déjà ce nom dans ce semestre." };
  }
  const action = patch.semester !== undefined ? "matiere.semestre" : "matiere.renommee";
  await auditAction(admin, { action, target: label(before), before: { name: before.name, shortName: before.shortName, semester: before.semester }, after: set });
  done();
  return {};
}

/** Ordre des matières d'une année (glisser ou boutons monter/descendre). */
export async function reorderSubjects(orderedIds: number[]): Promise<AdminResult> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const list = z.array(z.number().int().positive()).min(1).max(200).parse(orderedIds);
  await db.transaction(async (tx) => {
    for (const [index, id] of list.entries()) await tx.update(subjects).set({ position: index + 1 }).where(eq(subjects.id, id));
  });
  await auditAction(admin, { action: "matiere.ordre", target: { type: "subject", id: list[0], label: `${list.length} matières` } });
  done();
  return {};
}

export async function archiveSubject(id: number, archived: boolean): Promise<AdminResult> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const [row] = await db.update(subjects).set({ archivedAt: archived ? new Date() : null }).where(eq(subjects.id, id)).returning();
  if (row) await auditAction(admin, { action: archived ? "matiere.archivee" : "matiere.restauree", target: label(row) });
  done();
  return {};
}

/** Fusion (sensible) : cours, demandes et enseignants passent dans la matière gardée, l'autre est archivée. */
export async function mergeSubjects(keepId: number, dropId: number, reason: string): Promise<AdminResult<number>> {
  const admin = await adminFor("sensitive");
  if (isStepUp(admin)) return admin;
  const motive = reasonOf(reason);
  const [keep, drop] = [await subjectOf(keepId), await subjectOf(dropId)];
  if (!keep || !drop || keep.id === drop.id) return { error: "Choisis deux matières différentes." };
  if (keep.programId !== drop.programId) return { error: "Les deux matières doivent être de la même licence." };
  const moved = await db.update(documents).set({ subjectId: keep.id }).where(eq(documents.subjectId, drop.id)).returning({ id: documents.id });
  await db.update(schema.courseRequests).set({ subjectId: keep.id }).where(eq(schema.courseRequests.subjectId, drop.id));
  const teachers = await db.select().from(schema.subjectTeachers).where(eq(schema.subjectTeachers.subjectId, drop.id));
  if (teachers.length) await db.insert(schema.subjectTeachers).values(teachers.map((t) => ({ ...t, subjectId: keep.id }))).onConflictDoNothing();
  await db.update(schema.users).set({ favoriteSubjectId: keep.id }).where(eq(schema.users.favoriteSubjectId, drop.id));
  await db.update(subjects).set({ archivedAt: new Date() }).where(eq(subjects.id, drop.id));
  await auditAction(admin, { action: "matiere.fusionnee", target: label(keep), reason: motive, before: { dropped: drop.id, droppedName: drop.name }, after: { documents: moved.length } });
  done();
  return { data: moved.length };
}

/** Débuts des semestres d'une licence pour l'année (vide = calendrier par défaut). */
export async function setTermDates(programId: number, academicYear: string, s1: string, s2: string): Promise<AdminResult> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (!/^\d{4}-\d{4}$/.test(academicYear) || (s1 && !day.test(s1)) || (s2 && !day.test(s2))) return { error: "Date invalide." };
  if (s1 && s2 && s2 <= s1) return { error: "Le S2 commence après le S1." };
  const { academicTerms } = schema;
  for (const [parity, startsOn] of [[1, s1], [2, s2]] as const) {
    const where = and(eq(academicTerms.programId, programId), eq(academicTerms.academicYear, academicYear), eq(academicTerms.parity, parity));
    if (!startsOn) await db.delete(academicTerms).where(where);
    else await db.insert(academicTerms).values({ programId, academicYear, parity, startsOn }).onConflictDoUpdate({ target: [academicTerms.programId, academicTerms.academicYear, academicTerms.parity], set: { startsOn } });
  }
  const [program] = await db.select().from(programs).where(eq(programs.id, programId));
  await auditAction(admin, { action: "licence.dates", target: { type: "program", id: programId, label: program?.name ?? "" }, after: { academicYear, s1, s2 } });
  done();
  return {};
}

/** Aperçu de l'import CSV avant écriture : nouvelles, déjà présentes, invalides. */
export async function previewSubjectCsv(text: string): Promise<AdminResult<SubjectCsvRow[]>> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const existing = await db.select({ program: programs.name, level: subjects.level, semester: subjects.semester, name: subjects.name }).from(subjects).innerJoin(programs, eq(subjects.programId, programs.id));
  return { data: parseSubjectCsv(text, existing) };
}

/** licence;année;matière;nom court;semestre. Une licence inconnue est créée fermée. Sensible : écrit en masse. */
export async function importSubjects(text: string, reason: string): Promise<AdminResult<number>> {
  const admin = await adminFor("sensitive");
  if (isStepUp(admin)) return admin;
  const motive = reasonOf(reason);
  const existing = await db.select({ program: programs.name, level: subjects.level, semester: subjects.semester, name: subjects.name }).from(subjects).innerJoin(programs, eq(subjects.programId, programs.id));
  const rows = parseSubjectCsv(text, existing).filter((r) => r.status === "new");
  let created = 0;
  for (const r of rows) {
    const slug = slugOf(r.program);
    await db.insert(programs).values({ name: r.program.slice(0, 80), slug }).onConflictDoNothing();
    const [program] = await db.select().from(programs).where(eq(programs.slug, slug));
    const inserted = await db.insert(subjects).values({ programId: program.id, level: r.level, name: r.name, shortName: shortOf(r.name, r.short), semester: r.semester }).onConflictDoNothing().returning();
    created += inserted.length;
  }
  await auditAction(admin, { action: "matieres.importees", target: { type: "site", id: "matieres", label: `${created} matières` }, reason: motive });
  done();
  return { data: created };
}

/** Cours dont le semestre déclaré contredit celui de leur matière. */
export async function semesterConflicts(programId: number) {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return [];
  return db.select({ id: documents.id, title: documents.title, semester: documents.semester, subject: subjects.name, subjectSemester: subjects.semester })
    .from(documents).innerJoin(subjects, eq(documents.subjectId, subjects.id))
    .where(and(eq(subjects.programId, programId), sql`${documents.semester} is not null and ${subjects.semester} is not null and ${documents.semester} <> ${subjects.semester}`, sql`${documents.deletedAt} is null`)).limit(50);
}

