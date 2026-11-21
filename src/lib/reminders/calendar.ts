/** Les jours se comptent à Paris : un partiel lundi matin reste « demain » dimanche soir, quelle que soit l'heure du serveur. */
const PARIS = "Europe/Paris";

export const parisDay = (date: Date) => date.toLocaleDateString("sv-SE", { timeZone: PARIS });

export const parisHour = (date: Date) => Number(date.toLocaleString("en-GB", { timeZone: PARIS, hour: "2-digit", hourCycle: "h23" }));

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

export const daysBetween = (from: Date, to: Date) => dayNumber(parisDay(to)) - dayNumber(parisDay(from));

/** Le dernier dimanche, aujourd'hui compris. */
export function lastSunday(date: Date) {
  const number = dayNumber(parisDay(date));
  // Le 1er janvier 1970 était un jeudi
  const weekday = (number + 4) % 7;
  return new Date((number - weekday) * 86_400_000).toISOString().slice(0, 10);
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;
