/** Assez haut pour réviser normalement une journée de partiels, assez bas pour gêner une aspiration du site. */
export const DOWNLOADS_PER_HOUR = 120;
export const DOWNLOAD_ALERT_PER_HOUR = 60;
/** Pages de cours ouvertes : une révision intense en ouvre quelques dizaines par heure, une aspiration des centaines. */
export const READS_PER_HOUR = 300;
export const READ_ALERT_PER_HOUR = 150;

/** Son propre document et l'administration ne comptent pas. */
export const countsAsRead = (doc: { createdBy: string | null }, reader: { id: string; role: string }) => reader.role !== "admin" && doc.createdBy !== reader.id;

type File = { id: string; embedded: boolean };
type Doc = { coverFileId: string | null; createdBy: string | null };

/**
 * Seuls les fichiers joints comptent. Les images d'un cours et les couvertures se chargent en lisant,
 * et une vidéo envoie une requête partielle à chaque déplacement dans la lecture.
 */
export function countsAsDownload(file: File, doc: Doc, reader: { id: string; role: string }, partial: boolean) {
  if (file.embedded || file.id === doc.coverFileId || partial) return false;
  return reader.role !== "admin" && doc.createdBy !== reader.id;
}
