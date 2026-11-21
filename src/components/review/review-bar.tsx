import { and, asc, eq } from "drizzle-orm";
import { ReviewBarClient } from "@/components/review/review-bar-client";
import { canModerate } from "@/lib/access";
import { ATTESTATIONS } from "@/lib/attestations";
import { currentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";

/**
 * Barre de relecture sur la page d'un cours, même barre que la file « À valider » :
 * `validate` Publier / Renvoyer, `post` Marquer comme relu / Retirer, `revision` Accepter / Refuser la plus ancienne correction.
 * Rien pour qui ne modère pas ce document, ni quand il n'y a plus de décision à prendre.
 */
export async function ReviewBar({ documentId, mode }: { documentId: string; mode: "validate" | "post" | "revision" }) {
  const user = await currentUser();
  if (!user) return null;
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, documentId));
  if (!doc || doc.deletedAt || !canModerate(user, doc)) return null;
  const shortcuts = user.prefs?.shortcuts !== false;
  if (mode === "validate") {
    if (doc.published) return null;
    return <ReviewBarClient mode="validate" targetId={doc.id} documentId={doc.id} title={doc.title} blockedReason={doc.rightsBasis === "unknown" ? 1 : undefined} attestText={ATTESTATIONS.publish} shortcuts={shortcuts} />;
  }
  if (mode === "post") {
    if (!doc.published || (doc.reviewedAt && !doc.postReviewAt)) return null;
    return <ReviewBarClient mode="post" targetId={doc.id} documentId={doc.id} title={doc.title} removable={Boolean(doc.postReviewAt)} shortcuts={shortcuts} />;
  }
  const [revision] = await db.select({ id: schema.revisions.id }).from(schema.revisions)
    .where(and(eq(schema.revisions.documentId, doc.id), eq(schema.revisions.status, "pending"))).orderBy(asc(schema.revisions.createdAt)).limit(1);
  if (!revision) return null;
  return <ReviewBarClient mode="revision" targetId={revision.id} documentId={doc.id} title={doc.title} shortcuts={shortcuts} />;
}
