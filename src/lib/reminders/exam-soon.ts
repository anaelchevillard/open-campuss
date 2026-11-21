import { daysBetween, plural } from "./calendar";
import { examPhrase, examShort } from "@/lib/exam-kind";

/**
 * Série de révision programmée par la date d'un partiel : des rappels qui se resserrent à l'approche.
 * Plus de 35 jours : un par mois (J-30, J-60…) ; de J-35 à J-15 : un par semaine (J-35, J-28, J-21) ;
 * de J-14 à J-8 : tous les 3 jours (J-14, J-11, J-8) ; la dernière semaine : chaque jour.
 * Chaque rappel passe par notify() et donc par la limite d'un rappel par jour ; on la coupe partiel par partiel.
 */
export function examSeriesDue(days: number) {
  if (days < 1) return false;
  if (days <= 7) return true;
  if (days <= 14) return (14 - days) % 3 === 0;
  if (days <= 35) return days % 7 === 0;
  return days % 30 === 0;
}

/** Le nombre de jours si un rappel de la série est dû aujourd'hui, sinon null. */
export function examReminderDay(examAt: Date, now: Date) {
  const days = daysBetween(now, examAt);
  return examAt > now && examSeriesDue(days) ? days : null;
}

/** Jusqu'où regarder les partiels : la série commence au plus tôt un an avant. */
export const EXAM_SERIES_HORIZON_DAYS = 366;

/** La même série pour un contrôle continu, annoncé « CC de … ». */
export function examNotification(exam: { id: string; title: string; place: string; subject: string; kind?: string | null }, days: number) {
  const when = days === 1 ? "demain" : `dans ${plural(days, "jour")}`;
  return {
    kind: "exam_soon" as const,
    title: `${examPhrase(exam.kind, exam.subject)} ${when}`,
    body: [days <= 7 ? "Dernière ligne droite : une séance aujourd’hui" : "Série de révision : une séance aujourd’hui", exam.title === examShort(exam.kind) ? "" : exam.title, exam.place].filter(Boolean).join(" · "),
    href: "/reviser/partiels",
    dedupeKey: `exam:${exam.id}:${days}`,
  };
}
