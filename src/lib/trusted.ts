import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";

/**
 * Le badge « relu par un délégué » suit cette relecture : une publication sans relecture ne le donne jamais.
 */
export async function markDocumentReviewed(documentId: string, moderatorId: string) {
  await db.update(schema.documents).set({ reviewedBy: moderatorId, reviewedAt: new Date() }).where(eq(schema.documents.id, documentId));
}
