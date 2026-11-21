import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import type { User } from "./db/schema";
import { env } from "./env";
import { json } from "./http";
import { overQuota, quotaMessage } from "./storage-quota";

/** Calculé à partir des tailles en base : aucune requête à MinIO, et rien à tenir à jour à côté. */
export async function storageUsedBy(userId: string) {
  const { rows } = await db.execute<{ used: string }>(sql`
    select (select coalesce(sum(f.size), 0) from doc_files f join documents d on d.id = f.document_id where d.created_by = ${userId})
      + (select coalesce(sum(r.size), 0) from revision_files r join revision_spaces s on s.id = r.space_id where s.owner_id = ${userId})
      + (select coalesce(sum(c.size), 0) from card_images c where c.owner_id = ${userId})
      + (select coalesce(sum((p->>'size')::bigint), 0) from uploads u join documents d on d.id = u.document_id cross join lateral jsonb_array_elements(u.parts) p where coalesce(d.created_by, u.created_by) = ${userId}) as used`);
  return Number(rows[0]?.used ?? 0);
}

/**
 * Le fichier compte pour le propriétaire du cours ou de l'espace, pas forcément pour celui qui l'envoie.
 * `adding` vient du client : un mensonge reste borné par la taille maximale d'un envoi, et la fois d'après est refusée.
 */
export async function quotaRefusal(actor: Pick<User, "id" | "role">, ownerId: string | null, adding: number) {
  if (actor.role === "admin") return null;
  const owner = ownerId ?? actor.id;
  if (owner !== actor.id) {
    const [row] = await db.select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, owner));
    if (row?.role === "admin") return null;
  }
  const used = await storageUsedBy(owner);
  const quota = env.storageQuotaBytes;
  return overQuota(used, adding, quota) ? json({ error: quotaMessage(used, quota, owner === actor.id) }, 413) : null;
}

/** Ce qu'un import peut encore écrire en images, ou null s'il n'y a pas de limite. */
export async function quotaLeft(actor: Pick<User, "id" | "role">, ownerId: string | null) {
  if (actor.role === "admin") return null;
  return Math.max(0, env.storageQuotaBytes - await storageUsedBy(ownerId ?? actor.id));
}
