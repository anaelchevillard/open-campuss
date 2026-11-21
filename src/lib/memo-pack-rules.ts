/** Règles d'accès aux paquets de fiches, sans base : testées dans tests/paquets-acces.test.ts. */

export type PackViewer = { id: string; role: string; programId: number | null };
export type PackAccess = { ownerId: string; programId: number | null; friends: boolean; public: boolean; removedAt: Date | null };

export const FREE_SCOPE = "libre";
export const MAX_PACK_CARDS = 500;

/** Délégué de la licence du paquet ou administration : comme pour un document (canModerate). */
export function canModeratePack(viewer: PackViewer, pack: Pick<PackAccess, "programId">) {
  return viewer.role === "admin" || (viewer.role === "delegate" && pack.programId !== null && pack.programId === viewer.programId);
}

/**
 * Qui lit un paquet : son auteur ; un ami s'il est partagé aux amis ; une personne de la même licence s'il est public.
 * Un paquet retiré n'est plus lu que par son auteur et la modération.
 */
export function canSeePack(viewer: PackViewer, pack: PackAccess, isFriend: boolean) {
  if (viewer.id === pack.ownerId) return true;
  if (pack.removedAt) return canModeratePack(viewer, pack);
  if (pack.public && (viewer.role === "admin" || (pack.programId !== null && pack.programId === viewer.programId))) return true;
  if (pack.public && canModeratePack(viewer, pack)) return true;
  return pack.friends && isFriend;
}

/** Le paquet d'un cours ou les fiches libres : identifiant de portée stable. */
export function packScope(documentId: string | null) {
  return documentId ?? FREE_SCOPE;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Une portée de paquet lue dans l'URL (`?paquet=`) : « libre », un identifiant de cours, sinon null. */
export function parseScope(raw: unknown) {
  if (raw === FREE_SCOPE) return FREE_SCOPE;
  return typeof raw === "string" && UUID.test(raw) ? raw.toLowerCase() : null;
}

/** On invite à publier un paquet qui vaut la peine (5 fiches), jamais deux fois après un refus. */
export const PUBLISH_MIN_CARDS = 5;
export const GOOD_SESSION = { minDone: 5, minAccuracy: 80 };

export type PublishState = {
  cards: number;
  programId: number | null;
  pack: { public: boolean; removedAt: Date | null; publishDeclinedAt: Date | null } | null;
};

/** Pourquoi un paquet ne peut pas être publié (la même règle côté serveur et dans l'invitation), sinon null. */
export function publishRefusal(state: PublishState) {
  if (state.cards < 1) return "Ce paquet ne contient aucune fiche.";
  if (!state.programId) return "Choisis ta licence pour publier un paquet.";
  if (state.pack?.removedAt) return "Ce paquet a été retiré par la modération : il ne peut plus être publié.";
  return null;
}

/** L'invitation « Aide ta promo » : paquet publiable, assez fourni, pas déjà public, jamais refusé. */
export function shouldInvitePublish(state: PublishState) {
  return !publishRefusal(state) && state.cards >= PUBLISH_MIN_CARDS && !state.pack?.public && !state.pack?.publishDeclinedAt;
}

/** Une bonne séance : assez de fiches revues, et bien réussies. C'est le moment de proposer de partager. */
export function goodSession(done: number, good: number) {
  return done >= GOOD_SESSION.minDone && (good / done) * 100 >= GOOD_SESSION.minAccuracy;
}
