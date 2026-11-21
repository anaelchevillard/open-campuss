import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { notifyAdmins } from "./mail";
import { adminMails } from "@/lib/mail/catalog";
import { notify } from "./notify";
import { rateHit, rateLimited } from "./security";

/** Mail et centre de notifications, au plus une fois par jour pour une même clé. Une alerte qui rate ne bloque rien. */
export async function alertAdminsDaily(key: string, alert: { title: string; body: string; href: string }) {
  const rateKey = `admin-alert:${key}`;
  if (await rateLimited(rateKey, 1, 1440)) return;
  await rateHit(rateKey);
  await notifyAdmins(adminMails.alert(alert.title, alert.body, alert.href), { batch: false });
  const admins = await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.role, "admin"), eq(schema.users.status, "active")));
  for (const admin of admins) await notify(admin.id, { kind: "alert", ...alert });
}
