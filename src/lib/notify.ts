import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { env } from "./env";
import { queueMail } from "./mail";
import { notificationMailContent, type NotificationMail } from "./mail/catalog";
import { notificationMailEnabled, releaseDailySlot, takeDailySlot } from "./notification-state";
import { pushToDevices } from "./push";
import { pushPayload } from "./push-endpoint";
import { unsubscribeToken } from "./security";
import { forgetShellCounters } from "./shell-cache";
import { HOME } from "@/lib/home";

export type NotificationKind = "cards_due" | "exam_soon" | "new_course" | "qa_reply" | "impact" | "weekly" | "published" | "rejected" | "friend" | "revision_invite" | "course_request" | "duel" | "season" | "group" | "alert" | "connected_folder" | "withdrawal";

export type { NotificationMail };

export type NotificationInput = { kind: NotificationKind; title: string; body?: string; href?: string; dedupeKey?: string; mail?: NotificationMail };

// Les alertes d'administration partent déjà par mail, à part : elles ne doivent pas consommer le rappel du jour
const CENTER_ONLY = new Set<NotificationKind>(["alert", "weekly"]);

const { notifications, pushSubscriptions, users } = schema;

let deliveries: Promise<unknown> = Promise.resolve();

/** Pour la tâche quotidienne : ses rappels passent dans l'ordre où elle les a créés, le plus important d'abord. */
export const deliveriesSettled = () => deliveries;


async function deliver(row: typeof notifications.$inferSelect, mail: NotificationMail | undefined) {
  const devices = env.pushEnabled ? await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, row.userId)) : [];
  const canMail = Boolean(mail) && env.smtpEnabled;
  if (!devices.length && !canMail) return;
  const slot = await takeDailySlot(row.userId);
  const delivered = slot ? await pushToDevices(devices, pushPayload(row)) : 0;
  let sent = delivered > 0;
  // Les notifications par mail se coupent en un clic ; une décision sur le travail de quelqu'un part toujours
  const mailAllowed = mail && (mail.transactional || await notificationMailEnabled(row.userId));
  if (!sent && mail && mailAllowed && canMail && (slot || mail.transactional)) {
    const [person] = await db.select({ email: users.email }).from(users).where(eq(users.id, row.userId));
    if (person) {
      // Jamais urgent (aucune notification ne touche à la sécurité du compte) : regroupé avec les autres mails de la personne
      await queueMail(person.email, notificationMailContent(mail, row.id), mail.transactional
        ? { category: "transactional", batch: true }
        : { category: "notification", unsubscribePath: `/api/desabonnement/${unsubscribeToken(row.userId, "notifications")}`, batch: true });
      sent = true;
    }
  }
  if (sent) await db.update(notifications).set({ pushedAt: new Date() }).where(eq(notifications.id, row.id));
  // Un mail hors quota n'a pas utilisé le créneau : il reste libre comme si de rien n'était
  if (slot && (!sent || (delivered === 0 && mail?.transactional))) await releaseDailySlot(row.userId);
}

/**
 * Le seul point d'entrée pour prévenir quelqu'un. Le centre garde tout ; le push et le mail respectent la limite
 * d'un rappel par jour et partent après la réponse, sans la ralentir. Prévenir ne fait jamais échouer l'action.
 */
export async function notify(userId: string, notification: NotificationInput) {
  try {
    const [row] = await db.insert(notifications).values({
      userId, kind: notification.kind, title: notification.title.slice(0, 200), body: (notification.body ?? "").slice(0, 500), href: notification.href ?? HOME, dedupeKey: notification.dedupeKey ?? null,
    }).onConflictDoNothing().returning();
    if (!row) return;
    forgetShellCounters(userId);
    if (CENTER_ONLY.has(notification.kind)) return;
    if (!env.pushEnabled && !notification.mail) return;
    deliveries = deliveries.then(() => deliver(row, notification.mail)).catch((error) => console.error("notification : envoi en échec", error));
  } catch (error) {
    console.error("notification en échec", error);
  }
}
