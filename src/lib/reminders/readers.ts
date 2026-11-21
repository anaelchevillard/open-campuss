import "server-only";
import { and, countDistinct, eq, gte, isNull, sql } from "drizzle-orm";
import { db, schema } from "../db";

const { documents, docAuthors, readingProgress } = schema;

/** Lecteurs distincts sur 7 jours des cours d'un auteur, sans compter ses coauteurs ni lui : un total, jamais de nom. */
export async function weeklyReaders(authorId: string) {
  const mine = sql`(${documents.createdBy} = ${authorId} or exists (select 1 from ${docAuthors} where ${docAuthors.documentId} = ${documents.id} and ${docAuthors.userId} = ${authorId}))`;
  const others = and(sql`${readingProgress.userId} is distinct from ${documents.createdBy}`, sql`not exists (select 1 from ${docAuthors} where ${docAuthors.documentId} = ${documents.id} and ${docAuthors.userId} = ${readingProgress.userId})`);
  const where = and(mine, others, and(eq(documents.published, true), isNull(documents.deletedAt)), gte(readingProgress.updatedAt, new Date(Date.now() - 7 * 86_400_000)));
  const [[total], perDoc] = await Promise.all([
    db.select({ readers: countDistinct(readingProgress.userId) }).from(readingProgress).innerJoin(documents, eq(readingProgress.documentId, documents.id)).where(where),
    db.select({ id: documents.id, readers: countDistinct(readingProgress.userId) }).from(readingProgress).innerJoin(documents, eq(readingProgress.documentId, documents.id)).where(where).groupBy(documents.id),
  ]);
  return { readers: total.readers, courses: perDoc.length, perDoc: new Map(perDoc.map((row) => [row.id, row.readers])) };
}
