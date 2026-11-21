/** Le calcul du quota, sans base ni serveur : le reste dépend seulement de ce qui est déjà stocké. */
export const DEFAULT_QUOTA_MB = 500;
const MB = 1024 * 1024;

export function quotaBytes(raw: string | undefined) {
  const value = Number(raw);
  return (Number.isFinite(value) && value > 0 ? value : DEFAULT_QUOTA_MB) * MB;
}

export const overQuota = (used: number, adding: number, quota: number) => used >= quota || used + adding > quota;

/** Arrondi vers le bas : on n'annonce jamais plus de place qu'il n'en reste vraiment. */
export function formatQuota(bytes: number) {
  if (bytes >= 1024 * MB) return `${(Math.floor(bytes / (102.4 * MB)) / 10).toString().replace(".", ",")} Go`;
  return bytes < MB && bytes > 0 ? "moins de 1 Mo" : `${Math.floor(bytes / MB)} Mo`;
}

export function quotaMessage(used: number, quota: number, own: boolean) {
  const left = Math.max(0, quota - used);
  const remaining = left ? `il ${own ? "te" : "lui"} reste ${formatQuota(left)} sur ${formatQuota(quota)}` : `les ${formatQuota(quota)} sont utilisés`;
  return own
    ? `Ton espace de stockage ne suffit pas pour ce fichier : ${remaining}. Supprime des fichiers dont tu n’as plus besoin pour en ajouter.`
    : `L’espace de stockage de l’auteur de ce cours ne suffit pas pour ce fichier : ${remaining}.`;
}
