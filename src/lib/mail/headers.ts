import type { MailCategory } from "./content";

export const FALLBACK_FROM = "noreply@campuss.fr";

/**
 * En-têtes d'un envoi : Message-ID sur le domaine d'envoi, langue, mail automatique (pas de réponse d'absence),
 * et pour un mail non transactionnel la désinscription en un clic (RFC 8058). Aucun pixel ni redirection de lien.
 */
export function mailHeaders(input: { from: string; category: MailCategory; unsubscribeUrl?: string; id: string; siteHost: string }) {
  const domain = input.from.split("@")[1] || FALLBACK_FROM.split("@")[1];
  const headers: Record<string, string> = {
    "Content-Language": "fr",
    "Auto-Submitted": "auto-generated",
    "X-Auto-Response-Suppress": "OOF, AutoReply",
  };
  if (input.unsubscribeUrl && (input.category === "notification" || input.category === "weekly")) {
    headers["List-Unsubscribe"] = `<${input.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    headers["List-Id"] = `${input.category === "weekly" ? "Résumé de la semaine" : "Notifications"} <${input.category}.${input.siteHost}>`;
  }
  return { messageId: `<${input.id}@${domain}>`, headers };
}
