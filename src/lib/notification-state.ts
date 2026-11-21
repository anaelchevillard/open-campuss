import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { parisDay } from "./reminders/calendar";
import { trackEvent } from "./product-events";

const { notificationState: state } = schema;

export const RETURN_AFTER_DAYS = 21;
const VISIT_WRITE_MINUTES = 5;

/**
 * Prend le rappel du jour. La vérification et l'écriture sont une seule requête :
 * deux événements simultanés ne peuvent pas passer tous les deux.
 */
export async function takeDailySlot(userId: string, now = new Date()) {
  const day = parisDay(now);
  const taken = await db.insert(state).values({ userId, lastReminderDay: day })
    .onConflictDoUpdate({ target: state.userId, set: { lastReminderDay: day }, where: sql`${state.lastReminderDay} is distinct from ${day}` })
    .returning({ userId: state.userId });
  return taken.length > 0;
}

/** Rien n'est parti (appareil disparu, service en panne) : ce n'était pas un rappel. */
export const releaseDailySlot = (userId: string, now = new Date()) =>
  db.update(state).set({ lastReminderDay: null }).where(and(eq(state.userId, userId), eq(state.lastReminderDay, parisDay(now))));

/**
 * La visite d'avant reste connue à un retour : elle sert au bloc de l'accueil. Écrite au plus toutes les 5 minutes.
 * Renvoie `true` à la première visite écrite d'un jour (heure de Paris) : l'événement « première visite du jour »
 *. Deux requêtes simultanées n'écrivent qu'une fois (la seconde ne passe plus la condition).
 */
export async function recordVisit(userId: string, now = new Date()) {
  const { rows } = await db.execute<{ previous: Date | string | null }>(sql`
    with prev as (select last_visit_at from notification_state where user_id = ${userId})
    insert into notification_state (user_id, last_visit_at) values (${userId}, now())
    on conflict (user_id) do update set
      returned_from = case when notification_state.last_visit_at < now() - make_interval(days => ${RETURN_AFTER_DAYS}) then notification_state.last_visit_at else notification_state.returned_from end,
      returned_at = case when notification_state.last_visit_at < now() - make_interval(days => ${RETURN_AFTER_DAYS}) then now() else notification_state.returned_at end,
      last_visit_at = now()
    where notification_state.last_visit_at is null or notification_state.last_visit_at < now() - make_interval(mins => ${VISIT_WRITE_MINUTES})
    returning (select last_visit_at from prev) as previous`);
  if (!rows.length) return false;
  const previous = rows[0].previous;
  const firstToday = !previous || parisDay(new Date(previous)) !== parisDay(now);
  if (firstToday) await trackEvent("daily_active", { id: userId });
  return firstToday;
}

export async function setWeeklyMail(userId: string, weeklyMail: boolean) {
  await db.insert(state).values({ userId, weeklyMail }).onConflictDoUpdate({ target: state.userId, set: { weeklyMail } });
}

export async function weeklyMailEnabled(userId: string) {
  const [row] = await db.select({ weeklyMail: state.weeklyMail }).from(state).where(eq(state.userId, userId));
  return row?.weeklyMail ?? true;
}

export async function setNotificationMail(userId: string, notificationMail: boolean) {
  await db.insert(state).values({ userId, notificationMail }).onConflictDoUpdate({ target: state.userId, set: { notificationMail } });
}

export async function notificationMailEnabled(userId: string) {
  const [row] = await db.select({ notificationMail: state.notificationMail }).from(state).where(eq(state.userId, userId));
  return row?.notificationMail ?? true;
}

/** Désinscription depuis un mail : l'effet se limite au type de mail du jeton. */
export const setMailScope = (userId: string, scope: "weekly" | "notifications", enabled: boolean) =>
  scope === "weekly" ? setWeeklyMail(userId, enabled) : setNotificationMail(userId, enabled);

export const mailScopeEnabled = (userId: string, scope: "weekly" | "notifications") =>
  scope === "weekly" ? weeklyMailEnabled(userId) : notificationMailEnabled(userId);
