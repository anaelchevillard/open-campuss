/**
 * Qui met un cours en ligne sans passer par la file « À valider » : un cours est toujours relu avant publication.
 * - « moderate » : l'administration, ou un délégué de la licence, qui publie en modérant (attestation à l'appui) ;
 * - « teacher » : un enseignant, pour son propre cours dans une de ses matières ;
 * - « review » : tous les autres, étudiants compris, quel que soit le nombre de cours déjà validés.
 */
export type PublishRoute = "moderate" | "teacher" | "review";

export function publishRoute(user: { role: string }, facts: { canModerate: boolean; teacherOwnCourse: boolean }): PublishRoute {
  if (facts.canModerate && (user.role === "admin" || user.role === "delegate")) return "moderate";
  if (facts.teacherOwnCourse && user.role === "teacher") return "teacher";
  return "review";
}
