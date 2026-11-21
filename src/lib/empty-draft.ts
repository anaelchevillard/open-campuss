import { and, eq, isNull, type SQL } from "drizzle-orm";
import * as schema from "./db/schema";

const { documents } = schema;

/**
 * Le brouillon vide qu'un nouveau départ (le +, « Écrire », un import) peut reprendre au lieu d'en créer un autre.
 * Jamais un brouillon mis à la corbeille ni un brouillon d'une autre licence : la page de rédaction les refuse
 * (canEdit), et le + menait alors à « Page introuvable ».
 */
export function reusableEmptyDraft(userId: string, programId: number): SQL {
  return and(
    eq(documents.createdBy, userId), eq(documents.kind, "editor"), eq(documents.published, false), eq(documents.reviewRequested, false),
    eq(documents.title, ""), eq(documents.bodyMarkdown, ""), isNull(documents.deletedAt), eq(documents.programId, programId),
  )!;
}
