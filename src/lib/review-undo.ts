import "server-only";

/**
 * Une décision de relecture s'annule pendant le toast (6 s). Ce qui part chez quelqu'un d'autre (notification, mail) attend
 * la fin de ce délai : annuler ne laisse rien derrière. Gardé en mémoire du serveur (un seul processus) ; un redémarrage
 * pendant ces secondes perd la notification, jamais la décision.
 */
export const UNDO_MS = 8_000;

type Pending = { timer: ReturnType<typeof setTimeout>; revert: () => Promise<void>; expires: number };
const globals = globalThis as unknown as { campussUndo?: Map<string, Pending> };
const pending = (globals.campussUndo ??= new Map());

/** `key` porte l'identité de la personne qui décide : elle seule peut annuler. */
export function holdDecision(key: string, { revert, release }: { revert: () => Promise<void>; release?: () => Promise<void> }, ms = UNDO_MS) {
  const previous = pending.get(key);
  if (previous) clearTimeout(previous.timer);
  const timer = setTimeout(() => {
    pending.delete(key);
    void release?.().catch((error) => console.error("relecture : envoi différé en échec", error));
  }, ms);
  pending.set(key, { timer, revert, expires: Date.now() + ms });
}

/** Annule une décision encore en attente. Renvoie false si le délai est passé. */
export async function undoDecision(key: string) {
  const entry = pending.get(key);
  if (!entry || entry.expires < Date.now()) return false;
  clearTimeout(entry.timer);
  pending.delete(key);
  await entry.revert();
  return true;
}
