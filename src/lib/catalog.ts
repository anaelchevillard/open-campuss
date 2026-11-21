import "server-only";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { db, schema } from "./db";
import type { User } from "./db/schema";
import { LEVELS } from "./db/categories";
import { chosenParity, currentParity, SEMESTER_COOKIE } from "./semester";
import { cookies } from "next/headers";
import { compareByRating } from "./ratings";

const { programs, subjects, documents } = schema;

export const listPrograms = () => db.select().from(programs).orderBy(asc(programs.position), asc(programs.name));

/**
 * La licence affichée : celle du compte ; un administrateur (souvent sans licence) peut en choisir une par `?licence=`,
 * sinon la sienne ou la première active. Accueil et Matières partagent ce choix.
 */
export async function viewedProgram(user: Pick<User, "role" | "programId">, slug?: string) {
  const all = await listPrograms();
  if (user.role !== "admin") return all.find((p) => p.id === user.programId);
  return all.find((p) => p.slug === slug) ?? all.find((p) => p.id === user.programId) ?? all.find((p) => p.active) ?? all[0];
}

/** Un étudiant ne voit que les matières de son année ; l'administration et les enseignants gardent tout. */
export const yearLimited = (user: Pick<User, "role" | "level">) => user.role !== "admin" && user.role !== "teacher" && Boolean(user.level);

/**
 * Les matières proposées dans un formulaire : toutes pour un administrateur, celles de sa licence sinon.
 * `ownYear` (matière préférée, rédaction d'un cours) : un étudiant ne voit que celles de son année (L1, L2 ou L3) ;
 * `keep` garde la matière déjà choisie, même d'une autre année, pour ne jamais l'effacer en silence.
 */
export async function subjectOptions(user: User, { ownYear = false, keep = null }: { ownYear?: boolean; keep?: number | null } = {}) {
  const scope = user.role === "admin" ? undefined
    // Un enseignant choisit parmi ses matières, quelle que soit la licence
    : user.role === "teacher" ? sql`exists (select 1 from ${schema.subjectTeachers} t where t.subject_id = ${subjects.id} and t.user_id = ${user.id})`
    : user.programId ? eq(subjects.programId, user.programId) : sql`false`;
  const year = ownYear && yearLimited(user) ? or(eq(subjects.level, user.level!), keep ? eq(subjects.id, keep) : undefined) : undefined;
  return db.select({ id: subjects.id, name: subjects.name, level: subjects.level, semester: subjects.semester, program: programs.name }).from(subjects)
    .innerJoin(programs, eq(subjects.programId, programs.id))
    .where(and(scope, year))
    .orderBy(asc(programs.position), asc(subjects.level), asc(subjects.position), asc(subjects.id));
}

/**
 * L'année et le semestre affichés : l'URL (?semestre=), sinon le cookie, sinon le semestre courant.
 * L'année vient du cookie de la barre latérale, sinon du compte.
 */
export async function viewedTerm(user: User, query?: string | string[]) {
  const store = await cookies();
  const level = (LEVELS as readonly number[]).includes(Number(store.get("campuss-annee")?.value)) ? Number(store.get("campuss-annee")?.value) : user.level ?? 1;
  const current = user.programId ? await currentParity({ programId: user.programId, level }) : 1;
  const parity = chosenParity(query, store.get(SEMESTER_COOKIE)?.value, current);
  return { level, parity, current };
}

/** Ce qu'une carte de cours affiche, sans le texte ni les blocs. */
export const docCardFields = {
  id: documents.id, title: documents.title, category: documents.category, chapter: documents.chapter, semester: documents.semester, coverFileId: documents.coverFileId,
  academicYear: documents.academicYear, teacherName: documents.teacherName, updatedAt: documents.updatedAt, reviewedAt: documents.reviewedAt, published: documents.published,
  reviewRequested: documents.reviewRequested, subjectId: documents.subjectId,
};

export const DOC_SORTS = { "": "Récents", lus: "Plus lus", notes: "Mieux notés", az: "A-Z" } as const;
export type DocSort = keyof typeof DOC_SORTS;
export const docSort = (raw: string): DocSort => (raw in DOC_SORTS ? raw : "") as DocSort;
// Ancien nom gardé : « Voir tout » de l'accueil mène à ?tri=recent
export const docSortOf = (raw: string): DocSort => docSort(raw === "recent" ? "" : raw);

/** Ordre d'une liste de cartes : la base trie par date, le reste se fait ici (la note bayésienne n'existe pas en SQL). */
export function sortDocs<T extends { title: string; readers?: number; ratingAvg?: number | null; ratingCount?: number; updatedAt?: Date }>(rows: T[], sort: DocSort): T[] {
  const list = [...rows];
  if (sort === "lus") list.sort((a, b) => (b.readers ?? 0) - (a.readers ?? 0));
  if (sort === "notes") list.sort((a, b) => compareByRating({ ratingAvg: a.ratingAvg ?? null, ratingCount: a.ratingCount ?? 0 }, { ratingAvg: b.ratingAvg ?? null, ratingCount: b.ratingCount ?? 0 }));
  if (sort === "az") list.sort((a, b) => a.title.localeCompare(b.title, "fr", { sensitivity: "base" }));
  return list;
}
