"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit, requireAdmin } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { currentRelease } from "@/lib/release";

const input = z.object({ id: z.coerce.number().int().positive(), status: z.enum(["open", "resolved", "ignored"]) });

/**
 * Résolue (dans la version en ligne : elle se rouvre si elle revient dans une autre), ignorée (plus d'alerte, le
 * compteur continue) ou rouverte. Administrateurs seulement, journalisé.
 */
export async function setErrorStatus(form: FormData) {
  const admin = await requireAdmin();
  const parsed = input.safeParse({ id: form.get("id"), status: form.get("status") });
  if (!parsed.success) return;
  const { id, status } = parsed.data;
  const g = schema.errorGroups;
  const [row] = await db.update(g).set({
    status, statusAt: new Date(), statusRelease: status === "resolved" ? currentRelease() : null,
  }).where(eq(g.id, id)).returning({ name: g.name });
  if (!row) return;
  await audit(admin.email, `erreur_${status === "open" ? "rouverte" : status === "resolved" ? "résolue" : "ignorée"}`, `#${id} ${row.name}`);
  revalidatePath("/admin/erreurs");
  revalidatePath(`/admin/erreurs/${id}`);
}
