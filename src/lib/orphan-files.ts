const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ONLY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tout identifiant présent dans le contenu compte comme une référence, quelle que soit la forme de l'adresse :
 * se tromper dans ce sens garde un fichier de trop, l'autre sens casse un cours.
 */
export function collectFileIds(content: string | null | undefined, into: Set<string>) {
  for (const id of content?.match(UUID) ?? []) into.add(id.toLowerCase());
}

export type SweepCandidate = { id: string; createdAt: Date; lastActivity?: Date };

/** `lastActivity` : un cours modifié il y a peu peut encore revenir en arrière et retrouver son image. */
export function unreferencedFiles<T extends SweepCandidate>(files: T[], referenced: Set<string>, now: Date, graceMs: number): T[] {
  const cutoff = now.getTime() - graceMs;
  return files.filter((file) => !referenced.has(file.id.toLowerCase()) && file.createdAt.getTime() < cutoff && (file.lastActivity?.getTime() ?? 0) < cutoff);
}

/** Les objets du stockage sans ligne en base. Une clé qui n'a pas la forme attendue n'est jamais touchée. */
export function strayObjects(objects: { key: string; lastModified: Date }[], prefix: string, known: Set<string>, now: Date, graceMs: number) {
  const cutoff = now.getTime() - graceMs;
  return objects.filter(({ key, lastModified }) => {
    const id = key.startsWith(prefix) ? key.slice(prefix.length) : "";
    return ONLY_UUID.test(id) && !known.has(id.toLowerCase()) && lastModified.getTime() < cutoff;
  }).map((object) => object.key);
}
