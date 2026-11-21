import { inSentence } from "@/lib/subject-name";
/** Règles pures de la recherche de personnes et des abonnements (testées sans base). */

export const SEARCH_MIN = 2;
export const SEARCH_LIMIT = 20;
const SEARCH_MAX = 60;
// Contre l'énumération des comptes : 60 recherches par heure et par compte
export const SEARCH_RATE = { limit: 60, minutes: 60 } as const;

/** Le texte cherché, nettoyé ; null s'il est trop court pour être une recherche. */
export function searchTerm(raw: unknown) {
  const term = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX);
  return term.length >= SEARCH_MIN ? term : null;
}

/**
 * Le texte cherché doit se lire dans le nom AFFICHÉ (« Léa M. » pour qui n'est pas ami) : sinon chercher « Martin »
 * listerait les « Léa M. » qui s'appellent Martin, et le nom de famille caché se devinerait recherche après recherche.
 */
export function matchesShownName(shown: string, term: string) {
  return shown.toLocaleLowerCase("fr").includes(term.toLocaleLowerCase("fr"));
}

export type Relation = "none" | "sent" | "received" | "friends";

/** Le lien entre moi et quelqu'un, d'après la ligne d'amitié qui nous relie (s'il y en a une). */
export function relationOf(me: string, row: { requesterId: string; status: string } | undefined): Relation {
  if (!row || row.status === "refused") return "none";
  if (row.status === "accepted") return "friends";
  return row.requesterId === me ? "sent" : "received";
}

export type FollowedDoc = { id: string; title: string; subjectId: number; subject: string; programId: number; authors: string[] };
export type FollowNotification = { kind: "new_course"; title: string; body: string; href: string; dedupeKey: string };

/**
 * Abonnements d'une personne → un seul rappel du jour (le quota quotidien reste celui de notify).
 * Seulement les cours de sa licence (les seuls qu'elle peut lire), sans les siens ni ceux déjà annoncés par le rappel de ses matières (`already`).
 */
export function followNotification(docs: FollowedDoc[], follows: { people: Set<string>; subjects: Set<number> }, me: { id: string; programId: number }, already: Set<string>, day: string, authorName: (id: string) => string | null): FollowNotification | null {
  const picked = docs.filter((doc) => doc.programId === me.programId && !doc.authors.includes(me.id) && !already.has(doc.id) && (follows.subjects.has(doc.subjectId) || doc.authors.some((a) => follows.people.has(a))));
  if (!picked.length) return null;
  const first = picked[0];
  const author = first.authors.find((a) => follows.people.has(a));
  const who = author ? authorName(author) : null;
  const title = picked.length > 1 ? `${picked.length} nouveaux cours dans tes abonnements` : who ? `${who} a publié un cours` : `Nouveau cours en ${inSentence(first.subject)}`;
  return { kind: "new_course", title, body: picked.map((doc) => doc.title).join(", ").slice(0, 500), href: picked.length === 1 ? `/d/${first.id}` : "/amis?onglet=abonnements", dedupeKey: `follows:${day}` };
}
