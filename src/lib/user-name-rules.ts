/**
 * Noms affichés (pur, testé) : nom tiré de l'adresse universitaire, et forme courte « Prénom N. »
 * montrée aux personnes qui ne sont pas amies.
 */

const word = (part: string) => part.split("-").filter(Boolean).map((w) => w.charAt(0).toLocaleUpperCase("fr") + w.slice(1)).join("-");

/**
 * « lea_martin-durand2@etu.exemple.fr » → « Lea Martin-Durand » si le domaine est dans `domains` (NAMED_EMAIL_DOMAINS),
 * dont les adresses suivent prenom_nom@… ; null sinon.
 */
export function nameFromEmail(email: string, domains: readonly string[]): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domains.includes(domain)) return null;
  const match = /^([a-z]+(?:-[a-z]+)*)_([a-z]+(?:-[a-z]+)*)\d*$/.exec(email.slice(0, at).toLowerCase());
  if (!match) return null;
  return `${word(match[1])} ${word(match[2])}`.slice(0, 80);
}

/** « Léa Martin-Durand » → « Léa M. » ; un seul mot reste tel quel. */
export function shortName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return words[0] ?? "";
  const last = words[words.length - 1];
  const initial = [...last][0]?.toLocaleUpperCase("fr") ?? "";
  return `${words[0]} ${initial}.`;
}
