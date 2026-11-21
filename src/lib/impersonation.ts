import "server-only";
import { and, count, eq, gte, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "./db";
import type { User } from "./db/schema";
import { auditAction } from "./audit";
import { notify } from "./notify";
import { randomToken, tokenHash } from "./security";
import { appendPath, VIEW_COOKIE, VIEW_MINUTES, viewRefusal } from "./impersonation-rules";

const { impersonations } = schema;

export async function viewsStartedToday(adminId: string) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const [row] = await db.select({ n: count() }).from(impersonations).where(and(eq(impersonations.adminId, adminId), gte(impersonations.startedAt, since)));
  return row?.n ?? 0;
}

/**
 * Ouvre un aperçu de 15 minutes, non prolongeable, lié à la session de l'admin, toujours journalisé. La personne n'est
 * prévenue que si l'admin coche « Prévenir l'utilisateur ».
 */
export async function startView(admin: User, sessionHash: string, target: User, reason: string, warnTarget = false): Promise<string | null> {
  const refusal = viewRefusal({ adminId: admin.id, targetId: target.id, targetRole: target.role, targetIsOwner: target.isOwner, targetStatus: target.status, startedToday: await viewsStartedToday(admin.id), reason });
  if (refusal) return refusal;
  const token = randomToken();
  const expiresAt = new Date(Date.now() + VIEW_MINUTES * 60_000);
  const [row] = await db.insert(impersonations).values({ adminId: admin.id, targetId: target.id, adminSessionHash: sessionHash, tokenHash: tokenHash(token), reason: reason.trim().slice(0, 500), expiresAt }).returning();
  (await cookies()).set(VIEW_COOKIE, token, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: VIEW_MINUTES * 60 });
  await auditAction(admin, { action: "voir_comme.debut", target: { type: "user", id: target.id, label: target.name }, reason, after: { prevenu: warnTarget }, impersonationId: row.id });
  if (warnTarget) {
    await notify(target.id, { kind: "alert", title: "Un administrateur a vu Campuss comme toi", body: `Aperçu en lecture seule de 15 minutes. Motif : ${reason.trim().slice(0, 200)}`, href: "/parametres" });
    await db.update(impersonations).set({ notifiedAt: new Date() }).where(eq(impersonations.id, row.id));
  }
  return null;
}

/** Termine l'aperçu de cette session (bouton Quitter, ou expiration constatée). */
export async function endView(admin: Pick<User, "id" | "email">) {
  const store = await cookies();
  const token = store.get(VIEW_COOKIE)?.value;
  store.delete({ name: VIEW_COOKIE, path: "/", secure: true, httpOnly: true, sameSite: "strict" });
  if (!token) return;
  const [row] = await db.update(impersonations).set({ endedAt: new Date() }).where(and(eq(impersonations.tokenHash, tokenHash(token)), eq(impersonations.adminId, admin.id), isNull(impersonations.endedAt))).returning();
  if (row) {
    const [target] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, row.targetId));
    await auditAction(admin, { action: "voir_comme.fin", target: { type: "user", id: row.targetId, label: target?.name ?? "" }, after: { paths: row.paths }, impersonationId: row.id });
  }
}

/** Chemin vu pendant l'aperçu : gardé pour le journal (200 au plus). */
export async function recordViewPath(impersonationId: string, path: string) {
  const [row] = await db.select({ paths: impersonations.paths }).from(impersonations).where(eq(impersonations.id, impersonationId));
  if (!row) return;
  const next = appendPath(row.paths, path);
  if (next !== row.paths) await db.update(impersonations).set({ paths: sql`${JSON.stringify(next)}::jsonb` }).where(eq(impersonations.id, impersonationId));
}
