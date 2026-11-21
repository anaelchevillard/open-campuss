import "server-only";
import { announceAnswered } from "./course-requests";
import { closeNotes } from "./notes";

/** Commun aux chemins de publication : modérateur, publication en masse, enseignant dans sa matière. */
export async function afterPublished(documentId: string) {
  await closeNotes(documentId);
  await announceAnswered(documentId);
}
