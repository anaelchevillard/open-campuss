/**
 * Photos prises depuis « Commencer avec… », gardées en mémoire le temps d'ouvrir le brouillon (navigation côté client).
 * Rien n'est écrit sur le disque : recharger la page les oublie, ce qui est voulu.
 */
const MAX_AGE_MS = 5 * 60_000;

let pending: { files: File[]; at: number } | null = null;

export function keepPendingFiles(files: File[]) {
  pending = files.length ? { files, at: Date.now() } : null;
}

/** Une seule fois : un second éditeur ouvert ensuite ne doit pas les reprendre. */
export function takePendingFiles(now = Date.now()): File[] {
  const taken = pending;
  pending = null;
  return taken && now - taken.at < MAX_AGE_MS ? taken.files : [];
}

export const hasPendingFiles = () => Boolean(pending && Date.now() - pending.at < MAX_AGE_MS);
