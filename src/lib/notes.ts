import "server-only";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "./db";
import type { User } from "./db/schema";
import { NOTES_IDLE_DAYS } from "./notes-rules";

const { collabNotes, documents, docAuthors } = schema;

/** La colonne state n'est lue que par le serveur temps réel. */
export async function openNotesOf(documentId: string) {
  const [row] = await db.select({ startedBy: collabNotes.startedBy, open: collabNotes.open, turns: collabNotes.turns }).from(collabNotes).where(and(eq(collabNotes.documentId, documentId), isNull(collabNotes.closedAt)));
  return row ?? null;
}

/** Après la publication, le cours redevient un document ordinaire : son texte est dans documents, l'état Yjs n'a plus d'usage. */
export async function closeNotes(documentId: string) {
  await db.update(collabNotes).set({ closedAt: new Date(), state: null }).where(and(eq(collabNotes.documentId, documentId), isNull(collabNotes.closedAt)));
}

export async function closeIdleNotes() {
  await db.update(collabNotes).set({ closedAt: new Date(), state: null }).where(and(isNull(collabNotes.closedAt), lt(collabNotes.updatedAt, new Date(Date.now() - NOTES_IDLE_DAYS * 86_400_000))));
}

/** Sur la page d'une matière : les notes où l'on est déjà, et celles ouvertes par un délégué de la licence. */
export async function notesInProgress(user: Pick<User, "id" | "role" | "programId">, subjectId: number) {
  const member = sql<boolean>`(${documents.createdBy} = ${user.id} or exists (select 1 from doc_authors a where a.document_id = ${documents.id} and a.user_id = ${user.id}))`;
  const rows = await db.select({ id: documents.id, title: documents.title, member }).from(collabNotes).innerJoin(documents, eq(collabNotes.documentId, documents.id))
    .where(and(isNull(collabNotes.closedAt), eq(documents.subjectId, subjectId), eq(documents.published, false), or(eq(collabNotes.open, true), member))).limit(10);
  return rows;
}

export async function membersCount(documentId: string) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(docAuthors).where(eq(docAuthors.documentId, documentId));
  return row.n + 1;
}
