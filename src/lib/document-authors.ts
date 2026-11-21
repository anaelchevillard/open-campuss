import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "./db";

export type DocumentAuthorRole = "auteur" | "coauteur";
export type DocumentAuthor = { id: string; name: string; avatarKey: string | null; role: DocumentAuthorRole; addedAt: Date | null };

const { documents, documentAuthors, docAuthors, users } = schema;

/**
 * Les auteurs d'un document : l'auteur principal (documents.created_by) d'abord, puis les co-auteurs par date d'ajout.
 * Les co-auteurs d'avant document_authors (doc_authors seul) sont rendus sans date.
 */
export async function authorsOf(documentId: string): Promise<DocumentAuthor[]> {
  const [doc] = await db.select({ createdBy: documents.createdBy, createdAt: documents.createdAt }).from(documents).where(eq(documents.id, documentId));
  if (!doc) return [];
  const [main] = doc.createdBy ? await db.select({ id: users.id, name: users.name, avatarKey: users.avatarKey }).from(users).where(eq(users.id, doc.createdBy)) : [];
  const dated = await db.select({ id: users.id, name: users.name, avatarKey: users.avatarKey, addedAt: documentAuthors.addedAt }).from(documentAuthors)
    .innerJoin(users, eq(documentAuthors.userId, users.id)).where(eq(documentAuthors.documentId, documentId)).orderBy(asc(documentAuthors.addedAt));
  const legacy = await db.select({ id: users.id, name: users.name, avatarKey: users.avatarKey }).from(docAuthors)
    .innerJoin(users, eq(docAuthors.userId, users.id)).where(eq(docAuthors.documentId, documentId));
  const list: DocumentAuthor[] = main ? [{ ...main, role: "auteur", addedAt: doc.createdAt }] : [];
  for (const row of [...dated, ...legacy.map((l) => ({ ...l, addedAt: null }))]) {
    if (!list.some((a) => a.id === row.id)) list.push({ ...row, role: "coauteur" });
  }
  return list;
}

/** Ajoute un co-auteur : l'accès (doc_authors) et le registre daté (document_authors). */
export async function addCoauthor(documentId: string, userId: string) {
  await db.insert(docAuthors).values({ documentId, userId }).onConflictDoNothing();
  await db.insert(documentAuthors).values({ documentId, userId, role: "coauteur" }).onConflictDoNothing();
}

export async function removeCoauthor(documentId: string, userId: string) {
  await db.delete(docAuthors).where(and(eq(docAuthors.documentId, documentId), eq(docAuthors.userId, userId)));
  await db.delete(documentAuthors).where(and(eq(documentAuthors.documentId, documentId), eq(documentAuthors.userId, userId)));
}

/**
 * Une proposition acceptée fait de la personne une co-autrice, marquée « correcteur » dans le registre :
 * elle lit et corrige comme les autres auteurs, mais gagne les points d'une correction, pas ceux d'une création.
 * Rend true seulement si elle vient d'entrer, pour pouvoir annuler la décision proprement.
 */
export async function addCorrector(documentId: string, userId: string) {
  const [doc] = await db.select({ createdBy: documents.createdBy }).from(documents).where(eq(documents.id, documentId));
  if (!doc || doc.createdBy === userId) return false;
  const [already] = await db.select({ u: docAuthors.userId }).from(docAuthors).where(and(eq(docAuthors.documentId, documentId), eq(docAuthors.userId, userId)));
  if (already) return false;
  await db.insert(docAuthors).values({ documentId, userId }).onConflictDoNothing();
  await db.insert(documentAuthors).values({ documentId, userId, role: "correcteur" }).onConflictDoNothing();
  return true;
}
