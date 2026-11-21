/**
 * Réseaux sociaux du profil (pur) : on ne garde qu'un identifiant validé strictement, jamais une adresse libre.
 * Le lien est construit ici, depuis un modèle fixe par réseau.
 */
import type { ProfileSocials } from "@/lib/db/schema";

export type SocialId = keyof ProfileSocials;

export const SOCIALS: { id: SocialId; label: string; pattern: RegExp; rule: string; url: (handle: string) => string }[] = [
  // 1 à 30 caractères : lettres, chiffres, point, tiret bas ; pas de point au début, à la fin ni deux de suite
  { id: "instagram", label: "Instagram", pattern: /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9._]{1,30}$/, rule: "lettres, chiffres, point et tiret bas", url: (h) => `https://www.instagram.com/${h}/` },
  // 2 à 24 caractères : lettres, chiffres, point, tiret bas ; pas de point à la fin
  { id: "tiktok", label: "TikTok", pattern: /^(?!.*\.$)[a-z0-9._]{2,24}$/, rule: "lettres, chiffres, point et tiret bas", url: (h) => `https://www.tiktok.com/@${h}` },
  // 3 à 15 caractères : commence par une lettre, finit par une lettre ou un chiffre
  { id: "snapchat", label: "Snapchat", pattern: /^[a-z][a-z0-9._-]{1,13}[a-z0-9]$/, rule: "3 à 15 caractères, commence par une lettre", url: (h) => `https://www.snapchat.com/add/${h}` },
];

/** « @Lea.Martin » → « lea.martin » ; le reste est validé tel quel. */
export const tidyHandle = (raw: unknown) => (typeof raw === "string" ? raw.trim().replace(/^@/, "").toLowerCase() : "");

/** Nettoie ce qui arrive du navigateur : un identifiant invalide est une erreur, un champ vide efface le réseau. */
export function cleanSocials(raw: unknown): { ok: true; value: ProfileSocials | null } | { ok: false; error: string } {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: ProfileSocials = {};
  for (const social of SOCIALS) {
    const handle = tidyHandle(input[social.id]);
    if (!handle) continue;
    if (!social.pattern.test(handle)) return { ok: false, error: `${social.label} : identifiant seul (${social.rule}), pas d’adresse` };
    out[social.id] = handle;
  }
  return { ok: true, value: Object.keys(out).length ? out : null };
}

/** Liens prêts à afficher, construits depuis des identifiants déjà validés (revalidés ici par prudence). */
export function socialLinks(socials: ProfileSocials | null | undefined) {
  if (!socials) return [];
  return SOCIALS.flatMap((social) => {
    const handle = tidyHandle(socials[social.id]);
    return handle && social.pattern.test(handle) ? [{ id: social.id, label: social.label, handle, href: social.url(handle) }] : [];
  });
}
