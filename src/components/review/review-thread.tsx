import { eq } from "drizzle-orm";
import { ReviewThreadView } from "@/components/review/review-thread-view";
import { canModerate } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { authorsOf, reviewEventsOf } from "@/lib/document-reviews";

/**
 * Fil auteur ↔ relecteur d'un document : décisions, motifs et messages, avec le champ de réponse pour
 * l'auteur et les relecteurs de la licence. Rien pour les autres.
 */
export async function ReviewThread({ documentId, compact }: { documentId: string; compact?: boolean }) {
  const user = await currentUser();
  if (!user) return null;
  const [doc] = await db.select({ id: schema.documents.id, programId: schema.documents.programId, createdBy: schema.documents.createdBy, reviewRequested: schema.documents.reviewRequested, reviewRequestedAt: schema.documents.reviewRequestedAt })
    .from(schema.documents).where(eq(schema.documents.id, documentId));
  if (!doc) return null;
  const authors = await authorsOf(doc.id, doc.createdBy);
  if (!authors.includes(user.id) && !canModerate(user, doc)) return null;
  const events = await reviewEventsOf(documentId);
  if (!events.length && compact && !doc.reviewRequested) return null;
  return (
    <ReviewThreadView documentId={documentId} viewerId={user.id} compact={compact}
      events={events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }))}
      waitingSince={doc.reviewRequested ? (doc.reviewRequestedAt ?? new Date()).toISOString() : null} />
  );
}
