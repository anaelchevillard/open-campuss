import { parisDay, parisLocalToDate } from "./study-habits";

const midnight = (year: number, month: string) => parisLocalToDate(`${year}-${month}-01T00:00`)!;

/** Une saison par semestre universitaire : septembre à janvier, puis février à août. Le changement se fait à minuit à Paris. */
export function seasonOf(date: Date) {
  const [year, month] = parisDay(date).split("-").map(Number);
  if (month >= 9) return { key: `${year}-S1`, start: midnight(year, "09"), end: midnight(year + 1, "02"), label: `Automne ${year}` };
  if (month === 1) return { key: `${year - 1}-S1`, start: midnight(year - 1, "09"), end: midnight(year, "02"), label: `Automne ${year - 1}` };
  return { key: `${year}-S2`, start: midnight(year, "02"), end: midnight(year, "09"), label: `Printemps ${year}` };
}

const ANNOUNCE_DAYS = 14;
const NEW_DAYS = 30;

/** Au déploiement en cours de saison, rien ne part : on ne prévient que d'une saison qui vient de commencer. */
export const shouldAnnounceSeason = (season: { start: Date }, now: Date) => now.getTime() - season.start.getTime() < ANNOUNCE_DAYS * 86_400_000;

/** Le bandeau reste jusqu'à ce que la personne le ferme, pour cette saison. La suivante le fait revenir. */
export function seasonBanner(season: { key: string; start: Date }, dismissed: string | null | undefined, now: Date) {
  if (dismissed === season.key) return null;
  return { fresh: now.getTime() - season.start.getTime() < NEW_DAYS * 86_400_000 };
}

export const lastDayOf = (season: { end: Date }) => new Date(season.end.getTime() - 86_400_000).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long" });
