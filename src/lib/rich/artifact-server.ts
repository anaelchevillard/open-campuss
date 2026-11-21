import "server-only";
import { env } from "@/lib/env";
import { viewToken } from "@/lib/security";

/** L'adresse d'un artefact pour un lecteur : origine de contenu, jeton signé et daté (le même que /view). */
export function artifactSrc(docId: string, userId: string) {
  const token = viewToken(docId, userId);
  return (fileId: string, entry: string) => `${env.contentOrigin}/embed/${encodeURIComponent(token)}/${fileId}/${entry.split("/").map(encodeURIComponent).join("/")}`;
}
