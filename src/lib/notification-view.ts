import { daysBetween } from "./reminders/calendar";

export function timeAgo(date: Date, now = new Date()) {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const days = daysBetween(date, now);
  if (days < 1) return `il y a ${Math.floor(minutes / 60)} h`;
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} jours`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });
}

export const KIND_LABELS: Record<string, string> = {
  cards_due: "Fiches à réviser", exam_soon: "Partiel proche", new_course: "Nouveau cours", qa_reply: "Réponse à une question", impact: "Impact d’un cours", weekly: "Mail hebdomadaire",
  published: "Cours publié", rejected: "Cours à corriger", friend: "Amis", revision_invite: "Invitation à réviser", course_request: "Demande de cours", duel: "Duel", season: "Saison", group: "Groupe", alert: "Alerte", withdrawal: "Retrait d’un cours",
};

export const unreadLabel = (n: number) => (n > 9 ? "9+" : String(n));
