import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { canEditCourse, canReadDocument } from "./access";
import { db, schema } from "./db";
import type { Document, User } from "./db/schema";

type DocAccess = Pick<Document, "id" | "kind" | "programId" | "published" | "createdBy" | "subjectId" | "hiddenByReports" | "reviewRequested"> & { deletedAt?: Date | null };
type UserAccess = Pick<User, "id" | "role" | "programId">;

async function isCoauthor(userId: string, documentId: string) {
  const [row] = await db.select({ u: schema.docAuthors.userId }).from(schema.docAuthors).where(and(eq(schema.docAuthors.documentId, documentId), eq(schema.docAuthors.userId, userId)));
  return Boolean(row);
}

/** Enseignant rattaché à cette matière (table subject_teachers, posée par l'administration). */
export async function teachesSubject(userId: string, subjectId: number | null) {
  if (!subjectId) return false;
  const [row] = await db.select({ u: schema.subjectTeachers.userId }).from(schema.subjectTeachers).where(and(eq(schema.subjectTeachers.subjectId, subjectId), eq(schema.subjectTeachers.userId, userId)));
  return Boolean(row);
}

/** Auteur ou co-auteur : ce qu'un délégué ou un administrateur ne devient pas en relisant le brouillon d'un autre. */
export async function isDocAuthor(userId: string, doc: Pick<Document, "id" | "createdBy">) {
  return doc.createdBy === userId || isCoauthor(userId, doc.id);
}

/**
 * Lecture accordée par un auteur à un ami : la ligne de partage ne suffit pas, il faut qu'au moment de lire
 * la personne qui a partagé soit encore auteur du document et encore amie (sans blocage) avec la lectrice.
 */
export async function sharedWithFriend(userId: string, doc: Pick<Document, "id" | "createdBy">) {
  const { documentShares: s, friendships: f, userBlocks: b, docAuthors: a } = schema;
  const rows = await db.select({ u: s.userId }).from(s).where(and(eq(s.documentId, doc.id), eq(s.userId, userId),
    sql`exists (select 1 from ${f} where ${f.status} = 'accepted' and ((${f.requesterId} = ${s.sharedBy} and ${f.addresseeId} = ${s.userId}) or (${f.requesterId} = ${s.userId} and ${f.addresseeId} = ${s.sharedBy})))`,
    sql`not exists (select 1 from ${b} where (${b.blockerId} = ${s.sharedBy} and ${b.blockedId} = ${s.userId}) or (${b.blockerId} = ${s.userId} and ${b.blockedId} = ${s.sharedBy}))`,
    sql`(${s.sharedBy} = ${doc.createdBy} or exists (select 1 from ${a} where ${a.documentId} = ${s.documentId} and ${a.userId} = ${s.sharedBy}))`,
  )).limit(1);
  return rows.length > 0;
}

/** Point d'entrée unique : pages, fichiers et contenus passent par ici. */
export async function canRead(user: UserAccess, doc: DocAccess) {
  if (canReadDocument(user, doc)) return true;
  if (doc.deletedAt) return false;
  // Un ami choisi par un auteur lit le document, publié ou non, mais jamais un document masqué après signalements
  if (!doc.hiddenByReports && await sharedWithFriend(user.id, doc)) return true;
  if (user.role === "teacher") return teachesSubject(user.id, doc.subjectId);
  if (user.programId !== doc.programId) return false;
  return !doc.published && isCoauthor(user.id, doc.id);
}

export async function canEdit(user: UserAccess, doc: DocAccess) {
  if (canEditCourse(user, doc)) return true;
  if (doc.deletedAt) return false;
  // Un enseignant écrit ses propres brouillons dans ses matières, jamais les cours des étudiants
  if (user.role === "teacher") return doc.kind === "editor" && !doc.published && doc.createdBy === user.id && teachesSubject(user.id, doc.subjectId);
  return doc.kind === "editor" && !doc.published && doc.programId === user.programId && isCoauthor(user.id, doc.id);
}
