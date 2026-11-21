import "server-only";
import { and, count, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "./db";

const { documentRatings, readingProgress } = schema;

/**
 * À étaler dans le select d'une liste : tout se calcule dans la même requête, sans une requête par carte.
 * Les noms sont écrits en clair : sur une seule table, Drizzle retire le préfixe des colonnes, et ces sous-requêtes en ont besoin.
 * L'auteur ne compte pas parmi les lecteurs de son propre cours.
 */
export const cardStats = {
  ratingAvg: sql<number | null>`(select avg(r.stars)::float8 from document_ratings r where r.document_id = "documents"."id")`,
  ratingCount: sql<number>`(select count(*)::int from document_ratings r where r.document_id = "documents"."id")`,
  readers: sql<number>`(select count(*)::int from reading_progress p where p.document_id = "documents"."id" and p.user_id is distinct from "documents"."created_by")`,
};

/** Pour la page d'un cours : les mêmes chiffres, et la note de la personne qui lit. */
export async function loadDocStats(documentId: string, createdBy: string | null, userId: string) {
  const [[ratings], [mine], [readers]] = await Promise.all([
    db.select({ average: sql<number | null>`avg(${documentRatings.stars})::float8`, count: count() }).from(documentRatings).where(eq(documentRatings.documentId, documentId)),
    db.select({ stars: documentRatings.stars }).from(documentRatings).where(and(eq(documentRatings.documentId, documentId), eq(documentRatings.userId, userId))),
    db.select({ n: count() }).from(readingProgress).where(and(eq(readingProgress.documentId, documentId), createdBy ? ne(readingProgress.userId, createdBy) : undefined)),
  ]);
  return { average: ratings.average, count: ratings.count, mine: mine?.stars ?? 0, readers: readers.n };
}
