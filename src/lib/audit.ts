import "server-only";
import { headers } from "next/headers";
import { db, schema } from "./db";
import type { User } from "./db/schema";
import { levelOfAction, type ActionLevel, type AdminAction } from "./admin-actions";
import { visitorAddress } from "./visitor";
import { env } from "./env";

export type AuditTarget = { type: "user" | "document" | "subject" | "program" | "invitation" | "setting" | "announcement" | "report" | "request" | "site"; id: string | number; label: string };

/**
 * Journal enrichi des actions d'administration : qui, sur quoi, pourquoi, avant et après. Le journal est en lecture seule :
 * rien dans l'interface ne modifie ni ne supprime une ligne (la purge à un an est faite par la tâche de fond).
 */
export async function auditAction(actor: Pick<User, "id" | "email">, input: {
  action: AdminAction; level?: ActionLevel; target: AuditTarget; reason?: string | null; before?: unknown; after?: unknown; impersonationId?: string | null;
}) {
  const store = await headers();
  await db.insert(schema.auditLog).values({
    actor: actor.email.slice(0, 254), actorId: actor.id, action: input.action, target: input.target.label.slice(0, 300),
    targetType: input.target.type, targetId: String(input.target.id).slice(0, 64), targetLabel: input.target.label.slice(0, 200),
    reason: input.reason?.trim().slice(0, 500) || null, before: input.before ?? null, after: input.after ?? null,
    level: input.level ?? levelOfAction(input.action) ?? "routine", impersonationId: input.impersonationId ?? null,
    ip: visitorAddress((name) => store.get(name), env.trustedIpHeader), userAgent: (store.get("user-agent") ?? "").slice(0, 200),
  });
}
