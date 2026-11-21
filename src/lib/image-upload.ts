/** Envoi et suppression des images du profil (photo, bannière), depuis le navigateur. */

const failure = async (response: Response, fallback: string) => ((await response.json().catch(() => ({}))) as { error?: string }).error ?? fallback;

/** Envoie une image déjà préparée dans le navigateur (recadrée, réduite) à `endpoint`, qui la vérifie et la réencode. */
export async function postImage(image: Blob, endpoint: string) {
  const response = await fetch(endpoint, { method: "POST", body: image });
  if (!response.ok) throw new Error(await failure(response, "L’envoi a échoué"));
}

/**
 * Requête de suppression, avec un petit corps (« {} ») : sans corps, le navigateur n'envoie aucun Content-Length sur un DELETE,
 * et le proxy refuse toute écriture sans longueur (411). C'est ce qui empêchait « Retirer la photo ». Un corps vide (« "" ») ne suffit pas : certains clients n’envoient pas alors « Content-Length: 0 ».
 */
export const deleteInit = (): RequestInit => ({ method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}" });

export async function deleteImage(endpoint: string) {
  const response = await fetch(endpoint, deleteInit());
  if (!response.ok) throw new Error(await failure(response, "La suppression a échoué"));
}
