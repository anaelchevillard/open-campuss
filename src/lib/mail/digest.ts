import type { MailBlock, QueuedMail } from "./content";

/**
 * Pas de rafale de mails. Un mail « regroupable » (validations, refus, commentaires,
 * notifications, demandes, co-auteurs, files de l'équipe…) attend dans la file jusqu'à 10 minutes après le premier mail
 * en attente pour la même personne ; à l'envoi, tous ceux du même groupe partent en un seul récapitulatif.
 * Jamais pour la sécurité ou le compte (vérification, mot de passe, 2FA, connexion, changement d'adresse) : ceux-là
 * ne sont pas marqués regroupables et partent tout de suite, seuls.
 */
export const BATCH_WINDOW_MS = 10 * 60_000;
/** Au-delà, le reste part dans le récapitulatif suivant. */
export const DIGEST_MAX = 30;

/**
 * Clé de regroupement : même catégorie et même lien de désinscription. Un mail d'équipe ne se mêle pas à une
 * notification, et un récapitulatif garde le pied de page (désinscription comprise) de ce qu'il contient.
 */
export function batchKeyOf(mail: Pick<QueuedMail, "category" | "unsubscribePath">) {
  return `${mail.category}|${mail.unsubscribePath ?? ""}`.slice(0, 300);
}

/** Le moment d'envoi d'un mail regroupable : celui du groupe déjà en attente, sinon la fin d'une nouvelle fenêtre. */
export function batchSendAt(pending: Date | null | undefined, now = new Date(), windowMs = BATCH_WINDOW_MS) {
  return pending && pending > now ? pending : new Date(now.getTime() + windowMs);
}

const others = (n: number, team: boolean) => `${n} ${team ? (n > 1 ? "autres éléments" : "autre élément") : n > 1 ? "autres nouvelles" : "autre nouvelle"}`;

/** Dans un récapitulatif, un bouton par mail ferait une page de boutons : il devient un lien sous la nouvelle. */
const inline = (block: MailBlock): MailBlock => (block.type === "button" ? { type: "p", text: "", link: { label: block.label, path: block.path } } : block);

/** Un seul mail : rendu tel quel. Plusieurs : un récapitulatif au même gabarit, une section par mail, dans l'ordre. */
export function digestMail(mails: QueuedMail[], siteName: string): QueuedMail {
  if (mails.length === 1) return mails[0];
  const [first] = mails;
  const team = first.category === "admin";
  const subject = `${siteName} : ${first.title} et ${others(mails.length - 1, team)}`.slice(0, 200);
  return {
    subject,
    title: team ? `${mails.length} éléments à traiter` : `${mails.length} nouvelles pour toi`,
    preheader: mails.map((m) => m.title).join(" · ").slice(0, 140),
    greeting: first.greeting,
    blocks: mails.flatMap((mail): MailBlock[] => [{ type: "heading", text: mail.title }, ...mail.blocks.map(inline)]),
    reason: first.reason,
    contact: mails.some((m) => m.contact) || undefined,
    formal: first.formal,
    category: first.category,
    ...(first.unsubscribePath ? { unsubscribePath: first.unsubscribePath } : {}),
  };
}
