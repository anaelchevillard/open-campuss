import { plural } from "./calendar";

const DAY = 86_400_000;
// On ne relance pas tous les jours, et encore moins quand le rappel précédent n'a pas été ouvert
const AFTER_OPENED_DAYS = 2;
const AFTER_IGNORED_DAYS = 7;

export function shouldRemindCards(due: number, last: { createdAt: Date; readAt: Date | null } | null, now: Date) {
  if (due < 1) return false;
  if (!last) return true;
  const wait = last.readAt ? AFTER_OPENED_DAYS : AFTER_IGNORED_DAYS;
  // Une heure de marge : la tâche ne part pas à la minute près d'un jour à l'autre
  return now.getTime() - last.createdAt.getTime() >= wait * DAY - 3_600_000;
}

export const cardsDueNotification = (due: number) => ({ kind: "cards_due" as const, title: `${plural(due, "fiche")} à réviser`, href: "/reviser" });
