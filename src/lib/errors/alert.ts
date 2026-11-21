import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { notifyAdmins } from "@/lib/mail";
import { adminMails } from "@/lib/mail/catalog";
import { rateHit, rateLimited } from "@/lib/security";
import { SPIKE_PER_HOUR } from "./limit";

export type AlertCandidate = { id: number; name: string; message: string; count: number; windowCount: number; alertedAt: Date | null; regressedAt: Date | null };

/** Pourquoi prévenir : nouvelle erreur, erreur revenue après résolution, ou pic depuis la dernière alerte. */
export function alertReason(g: AlertCandidate): "new" | "back" | "spike" | null {
  if (!g.alertedAt) return "new";
  if (g.regressedAt && g.regressedAt > g.alertedAt) return "back";
  if (g.windowCount >= SPIKE_PER_HOUR) return "spike";
  return null;
}

const WORD = { new: "nouvelle", back: "revenue dans une nouvelle version", spike: "pic" } as const;

/** Texte de l'alerte : une ligne par erreur, 5 au plus. */
export function alertText(groups: (AlertCandidate & { reason: "new" | "back" | "spike" })[]) {
  const lines = groups.slice(0, 5).map((g) => `${g.name} : ${g.message.slice(0, 120)} (${WORD[g.reason]}, ${g.count} fois${g.reason === "spike" ? `, ${g.windowCount} dans l’heure` : ""})`);
  const more = groups.length > 5 ? ` Et ${groups.length - 5} autre${groups.length > 6 ? "s" : ""}.` : "";
  return `${lines.join(" · ")}.${more}`;
}

/**
 * Tâche de fond : une seule alerte par heure au plus, pour l'ensemble des erreurs à signaler, envoyée par les mails
 * regroupés de l'équipe. Une erreur ignorée ne prévient jamais. Ce qui n'a pas pu partir (heure déjà prise) reste à
 * signaler et part dans l'alerte suivante.
 */
export async function alertNewErrors() {
  const g = schema.errorGroups;
  const rows = await db.select({ id: g.id, name: g.name, message: g.message, count: g.count, windowCount: g.windowCount, alertedAt: g.alertedAt, regressedAt: g.regressedAt })
    .from(g)
    .where(and(eq(g.status, "open"), sql`(${g.alertedAt} is null or ${g.regressedAt} > ${g.alertedAt} or (${g.windowCount} >= ${SPIKE_PER_HOUR} and ${g.windowStart} > now() - interval '1 hour' and ${g.alertedAt} < ${g.windowStart}))`))
    .orderBy(sql`${g.lastSeen} desc`).limit(20);
  const due = rows.flatMap((row) => { const reason = alertReason(row); return reason ? [{ ...row, reason }] : []; });
  if (!due.length) return;
  const key = "admin-alert:erreurs";
  if (await rateLimited(key, 1, 60)) return;
  await rateHit(key);
  const title = due.length === 1 ? "Une erreur à regarder sur Campuss" : `${due.length} erreurs à regarder sur Campuss`;
  await notifyAdmins(adminMails.alert(title, alertText(due), "/admin/erreurs"));
  await db.update(g).set({ alertedAt: new Date() }).where(inArray(g.id, due.map((d) => d.id)));
}
