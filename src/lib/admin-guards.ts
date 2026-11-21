import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { lastAdminRefusal, type AdminSeat } from "@/lib/admin-rules";

export * from "@/lib/admin-rules";

/** Les administrateurs actifs et s'ils ont un second facteur (TOTP ou clé d'accès). */
export async function adminSeats(): Promise<AdminSeat[]> {
  const admins = await db.select({ id: schema.users.id, status: schema.users.status, totp: schema.users.totpEnabled, isOwner: schema.users.isOwner }).from(schema.users).where(eq(schema.users.role, "admin"));
  const ids = admins.map((a) => a.id);
  const keys = ids.length ? await db.selectDistinct({ userId: schema.passkeys.userId }).from(schema.passkeys).where(inArray(schema.passkeys.userId, ids)) : [];
  return admins.map((a) => ({ id: a.id, active: a.status === "active", secondFactor: a.totp || keys.some((k) => k.userId === a.id), isOwner: a.isOwner }));
}

/** Refus (message) si l'action prive le site de son dernier administrateur sûr, ou touche le compte propriétaire. */
export async function guardAdminChange(targetId: string, change: "demote" | "disable" | "delete" | "reset2fa") {
  return lastAdminRefusal(await adminSeats(), targetId, change);
}

/** ADMIN_EMAIL est le propriétaire du site : posé au démarrage, jamais retiré depuis l'interface. */
export async function markOwner(email: string) {
  if (!email) return;
  await db.update(schema.users).set({ isOwner: true }).where(and(eq(schema.users.email, email), eq(schema.users.role, "admin")));
}
