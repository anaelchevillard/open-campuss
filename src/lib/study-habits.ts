/** Objectif du jour et série : logique pure, jours au format AAAA-MM-JJ du fuseau Europe/Paris. */
export const DEFAULT_DAILY_GOAL = 5;
export const GOAL_CHOICES = [3, 5, 10, 15, 20, 30, 50] as const;
export const REST_DAYS_PER_WEEK = 2;

const PARIS_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
const PARIS_CLOCK = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

export const parisDay = (date: Date) => PARIS_DAY.format(date);

// En UTC pour ne jamais dépendre d'un changement d'heure : un jour fait ici toujours 24 heures
const shift = (day: string, by: number) => new Date(Date.parse(`${day}T00:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10);

/** Le lundi de la semaine du jour donné. */
export function weekOf(day: string) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return shift(day, -((weekday + 6) % 7));
}

export const shiftDay = shift;

export const VACATION_MAX_DAYS = 14;

/** Les jours couverts par le mode vacances : les 14 jours qui finissent à la date choisie. */
export function onVacation(day: string, vacationUntil: string | null | undefined) {
  return Boolean(vacationUntil && day <= vacationUntil && day > shift(vacationUntil, -VACATION_MAX_DAYS));
}

/**
 * Une série compte les jours révisés. Jusqu'à deux jours manqués par semaine (lundi à dimanche) ne la coupent pas,
 * un jour de vacances non plus, et aujourd'hui n'est jamais un jour manqué : la journée n'est pas finie.
 */
export function computeStreak(days: Iterable<string>, today: string, vacationUntil?: string | null) {
  const active = new Set([...days].filter((day) => day <= today));
  const earliest = [...active].sort()[0];
  const missed = new Map<string, number>();
  let streak = active.has(today) ? 1 : 0;
  if (earliest) {
    for (let cursor = shift(today, -1); cursor >= earliest; cursor = shift(cursor, -1)) {
      if (active.has(cursor)) { streak++; continue; }
      if (onVacation(cursor, vacationUntil)) continue;
      const week = weekOf(cursor);
      const count = (missed.get(week) ?? 0) + 1;
      if (count > REST_DAYS_PER_WEEK) break;
      missed.set(week, count);
    }
  }
  return { streak, activeToday: active.has(today) };
}

export type WeekDay = { day: string; state: "done" | "rest" | "vacation" | "today" | "future" | "off" };

/** La semaine en cours, lundi à dimanche : jours révisés, jours de repos pris (deux au plus), vacances, à venir. */
export function weekStrip(days: Iterable<string>, today: string, vacationUntil?: string | null): WeekDay[] {
  const active = new Set(days);
  const monday = weekOf(today);
  let rests = 0;
  return Array.from({ length: 7 }, (_, index) => {
    const day = shift(monday, index);
    if (active.has(day)) return { day, state: "done" as const };
    if (day === today) return { day, state: "today" as const };
    if (day > today) return { day, state: "future" as const };
    if (onVacation(day, vacationUntil)) return { day, state: "vacation" as const };
    rests++;
    return { day, state: rests <= REST_DAYS_PER_WEEK ? "rest" as const : "off" as const };
  });
}

/** Ni bonus ni quête entre 1 h et 5 h : la nuit sert à dormir. */
export const QUIET_FROM = 1;
export const QUIET_TO = 5;
export const parisHourOf = (date: Date) => Number(PARIS_CLOCK.formatToParts(date).find((part) => part.type === "hour")?.value ?? 0);
export const isQuietHour = (date: Date) => { const hour = parisHourOf(date); return hour >= QUIET_FROM && hour < QUIET_TO; };

/** Le jour des quêtes commence à 4 h à Paris : réviser à minuit et demie compte encore pour la veille. */
export const QUEST_DAY_HOUR = 4;
export const questDayOf = (date: Date) => parisDay(new Date(date.getTime() - QUEST_DAY_HOUR * 3_600_000));

/** Rappel du jour : une heure entre 7 h et 22 h, jamais plus tard. */
export const REMINDER_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22] as const;
export const cleanReminderHour = (value: unknown) => {
  if (value === null || value === "" || value === undefined) return null;
  const hour = Number(value);
  return (REMINDER_HOURS as readonly number[]).includes(hour) ? hour : null;
};

/** Vacances de 1 à 14 jours à partir d'aujourd'hui ; 0 les arrête. */
export const vacationEnd = (today: string, days: number) => {
  const n = Math.round(Number(days));
  if (!Number.isFinite(n) || n <= 0) return null;
  return shift(today, Math.min(VACATION_MAX_DAYS, n) - 1);
};

/** Les seuls mots montrés : la série se dit quand elle existe, et rien n'est dit quand elle n'existe pas. */
export function streakLine(streak: number) {
  if (streak < 1) return "";
  return `Série de ${streak} jour${streak > 1 ? "s" : ""}, avec deux jours de repos par semaine.`;
}

export const cleanGoal = (value: unknown) => {
  const goal = Number(value);
  return (GOAL_CHOICES as readonly number[]).includes(goal) ? goal : DEFAULT_DAILY_GOAL;
};

function parisOffset(at: number) {
  const parts = Object.fromEntries(PARIS_CLOCK.formatToParts(new Date(at)).map((part) => [part.type, part.value]));
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - Math.floor(at / 60_000) * 60_000;
}

/** Un champ datetime-local n'a pas de fuseau : ce qu'a saisi l'étudiant est une heure de Paris, quel que soit le fuseau du serveur. */
export function parisLocalToDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wanted);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59) return null;
  let guess = wanted - parisOffset(wanted);
  guess = wanted - parisOffset(guess);
  return new Date(guess);
}
