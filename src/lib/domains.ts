import { createHmac } from "node:crypto";

/** Règles pures sur les adresses : domaine, ressemblance trompeuse, empreinte d'une adresse bannie. Testées sans base. */

export const domainOf = (email: string) => email.slice(email.lastIndexOf("@") + 1).trim().toLowerCase();

/** Adresse comparable : minuscules, sans espaces, sans « +étiquette » (alias d'une même boîte). */
export function normalizeEmail(email: string) {
  const clean = email.trim().toLowerCase();
  const at = clean.lastIndexOf("@");
  if (at < 1) return clean;
  return `${clean.slice(0, at).replace(/\+.*$/, "")}@${clean.slice(at + 1)}`;
}

/** Distance d'édition (insertions, suppressions, substitutions), bornée : au-delà de max, renvoie max + 1. */
export function editDistance(a: string, b: string, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, row[j]);
    }
    if (best > max) return max + 1;
    previous = row;
  }
  return previous[b.length];
}

export type DomainVerdict = { kind: "verified"; domain: string } | { kind: "lookalike"; domain: string; like: string } | { kind: "other"; domain: string };

/**
 * Domaine étudiant reconnu, domaine qui ressemble à un domaine reconnu (faute de frappe, préfixe ou suffixe trompeur),
 * ou autre. Comparaison exacte pour « reconnu » : etu.exemple.fr.autre.com et faux-etu.exemple.fr ne le sont pas.
 */
export function domainVerdict(email: string, approved: string[]): DomainVerdict {
  const domain = domainOf(email);
  const list = approved.map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (list.includes(domain)) return { kind: "verified", domain };
  for (const like of list) {
    const deceptive = domain.endsWith(like) || domain.startsWith(`${like}.`) || domain.includes(`.${like}.`);
    if (deceptive || editDistance(domain, like, 2) <= 2) return { kind: "lookalike", domain, like };
  }
  return { kind: "other", domain };
}

/** Domaine refusé : exact, ou sous-domaine du domaine refusé. */
export function domainBlocked(email: string, blocked: string[]) {
  const domain = domainOf(email);
  return blocked.some((b) => {
    const d = b.trim().toLowerCase().replace(/^@/, "");
    return d && (domain === d || domain.endsWith(`.${d}`));
  });
}

/**
 * Empreinte d'une adresse bannie : HMAC-SHA256 de l'adresse normalisée, avec une clé dérivée de SECRET_KEY.
 * Sans la clé, la table ne permet pas de retrouver les adresses (pas d'attaque par dictionnaire).
 */
export function emailHmac(email: string, secret: string) {
  const key = createHmac("sha256", secret).update("campuss:banned-identities:v1").digest();
  return createHmac("sha256", key).update(normalizeEmail(email)).digest("hex");
}

/**
 * L'inscription publique n'accepte que les domaines étudiants de la liste blanche
 * (réglage « registration.autoApproveDomains », acceptés sans validation) et, s'il y en a, des autres domaines admis
 * avec validation par l'équipe (« registration.reviewedDomains »), en comparaison exacte. L'administration crée toujours un compte pour
 * n'importe quelle adresse, et une invitation reste valable : ces deux chemins n'appellent pas cette règle.
 * Le refus ne dépend que du domaine saisi, jamais d'un compte existant : il ne révèle rien.
 */
export function publicSignupAllowed(email: string, students: string[], reviewed: string[] = []) {
  return domainVerdict(email, students).kind === "verified" || domainVerdict(email, reviewed).kind === "verified";
}

export function studentsOnlyMessage(approved: string[]) {
  const domain = approved.map((d) => d.trim().toLowerCase().replace(/^@/, "")).find(Boolean);
  return domain
    ? `Seuls les étudiants peuvent créer un compte : utilise ton adresse @${domain}`
    : "Les inscriptions se font sur invitation : utilise le lien reçu.";
}
