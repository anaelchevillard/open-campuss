/** Répondre à sa propre question ne prévient personne ; une question dont l'auteur a quitté le site non plus. */
export function qaReplyNotification(reply: { askerId: string | null; replierId: string; docId: string; docTitle: string }) {
  if (!reply.askerId || reply.askerId === reply.replierId) return null;
  return {
    kind: "qa_reply" as const,
    title: "Réponse à ta question",
    body: `Sur « ${reply.docTitle} »`,
    href: `/d/${reply.docId}#questions`,
  };
}
