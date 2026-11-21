import "server-only";
import { and, isNotNull, lt } from "drizzle-orm";
import { db, schema } from "./db";
import { flushInvitationQueue, purgeAdminLeftovers } from "./invitations";
import { deleteUserAccount } from "./purge";

let lastQueue = 0;
let lastDaily = 0;

/** Tâches de l'administration, appelées à chaque tour de la boucle : elles se cadencent elles-mêmes. */
export async function runAdminJobs(now = Date.now()) {
  // File d'invitations plafonnée : toutes les 5 minutes, sous mail.dailyLimit
  if (now - lastQueue > 5 * 60_000) {
    lastQueue = now;
    await flushInvitationQueue();
  }
  if (now - lastDaily > 3_600_000) {
    lastDaily = now;
    // Suppression programmée à J+30 : le compte est déjà désactivé, on l'efface pour de bon
    const due = await db.select({ id: schema.users.id, avatarKey: schema.users.avatarKey }).from(schema.users).where(and(isNotNull(schema.users.deletionScheduledAt), lt(schema.users.deletionScheduledAt, new Date(now))));
    for (const account of due) await deleteUserAccount(account);
    await purgeAdminLeftovers();
  }
}
