/**
 * Un mail est d'abord une donnée : titre, blocs de texte brut et chemins du site. La file d'envoi garde cette donnée,
 * le gabarit la met en forme au moment de l'envoi (HTML et texte). Aucun bloc n'accepte de HTML : tout est échappé
 * au rendu, et un lien n'est qu'un chemin, préfixé par BASE_URL.
 */

/** transactional : compte, sécurité, décisions. notification et weekly : désinscription possible. admin : équipe. */
export type MailCategory = "transactional" | "notification" | "weekly" | "admin";

export type MailLink = { label: string; path: string };

export type MailBlock =
  | { type: "p"; text: string; link?: MailLink }
  /** Intertitre d'une section (récapitulatif de plusieurs mails) */
  | { type: "heading"; text: string }
  | { type: "quote"; text: string }
  | { type: "code"; code: string; label?: string }
  | { type: "button"; label: string; path: string }
  | { type: "facts"; items: { label: string; value: string }[] }
  | { type: "list"; items: { text: string; link?: MailLink }[] }
  | { type: "note"; text: string; link?: MailLink };

export type MailContent = {
  /** Objet complet, préfixe compris. */
  subject: string;
  title: string;
  /** Texte d'aperçu, affiché après l'objet dans la liste des mails. */
  preheader?: string;
  greeting?: string;
  blocks: MailBlock[];
  /** Pourquoi la personne reçoit ce mail. Par défaut, selon la catégorie. */
  reason?: string;
  /** Une réponse a du sens : l'adresse d'envoi n'étant pas lue, le pied renvoie vers la page de contact. */
  contact?: boolean;
  /** Vouvoiement : un ayant droit extérieur. */
  formal?: boolean;
};

/** Ce que la file garde : le contenu, sa catégorie et, pour un mail non transactionnel, le chemin de désinscription. */
export type QueuedMail = MailContent & { category: MailCategory; unsubscribePath?: string };

export const p = (text: string, link?: MailLink): MailBlock => ({ type: "p", text, ...(link ? { link } : {}) });
export const note = (text: string, link?: MailLink): MailBlock => ({ type: "note", text, ...(link ? { link } : {}) });
export const quote = (text: string): MailBlock => ({ type: "quote", text });
export const button = (label: string, path: string): MailBlock => ({ type: "button", label, path });
export const code = (value: string, label?: string): MailBlock => ({ type: "code", code: value, ...(label ? { label } : {}) });
export const facts = (items: { label: string; value: string }[]): MailBlock => ({ type: "facts", items });
export const hello = (name?: string | null) => (name ? `Bonjour ${name},` : "Bonjour,");

/** Ancienne ligne de la file (texte brut seul) : envoyée dans le gabarit, paragraphe par paragraphe. */
export function legacyMail(subject: string, body: string): QueuedMail {
  const title = subject.replace(/^[^:]+ : /, "");
  return { subject, title: title.charAt(0).toUpperCase() + title.slice(1), category: "transactional", blocks: body.trim().split(/\n{2,}/).map((text) => p(text)) };
}
