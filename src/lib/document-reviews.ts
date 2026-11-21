import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/** Fil auteur ↔ relecteur d'un document. */
export type ReviewEventKind = "sent" | "published" | "rejected" | "removed" | "post_ok" | "comment" | "resubmitted";

const { documentReviews, documents, docAuthors, users } = schema;

export async function addReviewEvent({ documentId, authorId, kind, reasonCode, body }: { documentId: string; authorId: string | null; kind: ReviewEventKind; reasonCode?: number | null; body?: string }) {
  const [row] = await db.insert(documentReviews).values({ documentId, authorId, kind, reasonCode: reasonCode ?? null, body: (body ?? "").slice(0, 2000) }).returning();
  return row;
}

/** Une décision annulée ne laisse pas de trace dans le fil. */
export async function removeReviewEvent(id: string) {
  await db.delete(documentReviews).where(eq(documentReviews.id, id));
}

export async function reviewEventsOf(documentId: string) {
  return db.select({ id: documentReviews.id, kind: documentReviews.kind, reasonCode: documentReviews.reasonCode, body: documentReviews.body, createdAt: documentReviews.createdAt, authorId: documentReviews.authorId, authorName: users.name })
    .from(documentReviews).leftJoin(users, eq(documentReviews.authorId, users.id))
    .where(eq(documentReviews.documentId, documentId)).orderBy(asc(documentReviews.createdAt));
}

export type ReviewEvent = Awaited<ReturnType<typeof reviewEventsOf>>[number];

/** Le dernier renvoi ou retrait de chaque document : motif et relecteur, pour « À corriger ». */
export async function lastSendBacks(documentIds: string[]) {
  if (!documentIds.length) return new Map<string, { reasonCode: number | null; body: string; reviewer: string | null; at: Date }>();
  const rows = await db.select({ documentId: documentReviews.documentId, reasonCode: documentReviews.reasonCode, body: documentReviews.body, reviewer: users.name, at: documentReviews.createdAt })
    .from(documentReviews).leftJoin(users, eq(documentReviews.authorId, users.id))
    .where(and(inArray(documentReviews.documentId, documentIds), inArray(documentReviews.kind, ["rejected", "removed"]))).orderBy(desc(documentReviews.createdAt));
  const out = new Map<string, { reasonCode: number | null; body: string; reviewer: string | null; at: Date }>();
  for (const row of rows) if (!out.has(row.documentId)) out.set(row.documentId, row);
  return out;
}

/** L'auteur et les coauteurs d'un document. */
export async function authorsOf(documentId: string, createdBy: string | null) {
  const extra = await db.select({ id: docAuthors.userId }).from(docAuthors).where(eq(docAuthors.documentId, documentId));
  return [...new Set([...(createdBy ? [createdBy] : []), ...extra.map((a) => a.id)])];
}

/** Le relecteur à prévenir quand l'auteur répond : la dernière personne, hors auteurs, qui a écrit dans le fil. */
export async function lastReviewerOf(documentId: string, authors: string[]) {
  const rows = await db.select({ authorId: documentReviews.authorId }).from(documentReviews)
    .where(eq(documentReviews.documentId, documentId)).orderBy(desc(documentReviews.createdAt)).limit(30);
  return rows.map((r) => r.authorId).find((id): id is string => Boolean(id) && !authors.includes(id!)) ?? null;
}

export async function documentTitle(documentId: string) {
  const [doc] = await db.select({ title: documents.title }).from(documents).where(eq(documents.id, documentId));
  return doc?.title ?? "";
}
