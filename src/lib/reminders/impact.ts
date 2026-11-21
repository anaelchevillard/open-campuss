import { plural } from "./calendar";

export const IMPACT_THRESHOLDS = [10, 25, 40, 100, 250, 500, 1000, 2500, 5000, 10000];

/** Le plus haut seuil atteint et pas encore annoncé : un cours découvert d'un coup ne déclenche qu'un message. */
export function crossedThreshold(readers: number, announced: number) {
  const reached = IMPACT_THRESHOLDS.filter((threshold) => threshold <= readers && threshold > announced);
  return reached.at(-1) ?? null;
}

export const impactNotification = (doc: { id: string; title: string }, threshold: number) => ({
  kind: "impact" as const,
  title: `Ton cours a aidé ${threshold} personnes`,
  body: doc.title,
  href: `/d/${doc.id}`,
  dedupeKey: `impact:${doc.id}:${threshold}`,
});

/** La phrase montrée à l'auteur, qui ne parle que d'un nombre : jamais de qui. */
export function impactSentence(readers: number, courses = 1) {
  return `${courses > 1 ? "Tes cours ont aidé" : "Ton cours a aidé"} ${plural(readers, "étudiant")} cette semaine`;
}
