// Fonctions pures, partagées avec l'éditeur : l'heure vient du serveur, jamais du rendu.

export const REVIEW_PROMISE = "Validation sous 24 h en général.";

const HOUR = 3_600_000;

export const isOverdue = (requestedAt: Date, now: Date) => now.getTime() - requestedAt.getTime() > 24 * HOUR;

export function waitingFor(requestedAt: Date, now: Date) {
  const hours = Math.floor((now.getTime() - requestedAt.getTime()) / HOUR);
  if (hours < 1) return "moins d’une heure";
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} jour${days > 1 ? "s" : ""}`;
}

/** Au-delà de 24 h, on le dit tel quel, sans annoncer de nouveau délai que personne ne peut garantir. */
export function reviewWaitMessage(requestedAt: Date | null, now = new Date()) {
  if (!requestedAt) return REVIEW_PROMISE;
  return isOverdue(requestedAt, now)
    ? `${REVIEW_PROMISE} Le tien attend depuis ${waitingFor(requestedAt, now)}, c’est plus long que d’habitude : les modérateurs reçoivent un rappel.`
    : `${REVIEW_PROMISE} Il attend depuis ${waitingFor(requestedAt, now)}.`;
}

export function reviewWaitShort(requestedAt: Date | null, now = new Date()) {
  if (!requestedAt) return "En attente de validation";
  return `En attente depuis ${waitingFor(requestedAt, now)}${isOverdue(requestedAt, now) ? ", plus long que d’habitude" : ""}`;
}
