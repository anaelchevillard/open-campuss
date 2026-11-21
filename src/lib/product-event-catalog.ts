// Catalogue fermé des événements produits. Pur : partagé par le schéma, le serveur et les tests.
// Un événement s'enregistre côté serveur, à l'endroit où l'action réussit ; jamais depuis le navigateur.

export const PRODUCT_EVENTS = {
  signup: "Inscription",
  daily_active: "Première visite du jour",
  doc_read: "Cours ouvert pour la première fois",
  card_created: "Fiche créée",
  cards_imported: "Fiches importées",
  review_session: "Séance de révision terminée",
  quiz_done: "Quiz terminé",
  mock_exam: "Partiel blanc terminé",
  doc_submitted: "Cours envoyé (relecture ou publication)",
  pack_published: "Paquet de fiches publié",
} as const;

export type ProductEvent = keyof typeof PRODUCT_EVENTS;
export const PRODUCT_EVENT_NAMES = Object.keys(PRODUCT_EVENTS) as [ProductEvent, ...ProductEvent[]];

export const isProductEvent = (name: unknown): name is ProductEvent => typeof name === "string" && Object.hasOwn(PRODUCT_EVENTS, name);

/**
 * Le choix qui vaut pour une personne : celui du compte, sinon celui du cookie de cet appareil (même règle que
 * /api/track). Seul « yes » autorise le lien entre un événement et la personne.
 */
export function consentOf(account: string | null | undefined, cookie: string | null | undefined) {
  return (account ?? cookie) === "yes";
}

/**
 * Ce qui s'écrit pour un événement : le total du jour toujours (sans identifiant), la ligne liée à la personne
 * seulement avec son accord. Sans personne connue (ou sans accord), aucun identifiant n'est gardé.
 */
export function eventWrites(name: ProductEvent, userId: string | null, consented: boolean) {
  return { daily: { name }, individual: userId && consented ? { name, userId } : null };
}

/** Durées de conservation (politique de confidentialité, registre, purge dans lib/boot.ts). */
export const RETENTION = {
  errorDays: 90,
  individualEventDays: 396, // 13 mois
  dailyEventDays: 760, // 25 mois, comme les autres totaux d'audience
} as const;
