import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin, requireCriticalAdmin, requireFreshAdmin } from "./auth";
import { db, schema } from "./db";
import type { User } from "./db/schema";
import { NO_REASON, type ActionLevel } from "./admin-actions";

export { NO_REASON };
import type { StepUpMethods, StepUpRequired } from "./step-up";

/** Réponse des actions d'administration : une erreur se montre sur place, une preuve manquante ouvre le second facteur. */
export type AdminResult<T = undefined> = { ok?: string; error?: string; stepUp?: StepUpMethods; data?: T };

/** Garde selon le niveau : courante = admin ; sensible = second facteur < 10 min ; critique = < 2 min. */
export async function adminFor(level: ActionLevel): Promise<User | StepUpRequired> {
  if (level === "critical") return requireCriticalAdmin();
  if (level === "sensitive") return requireFreshAdmin();
  return requireAdmin();
}

export const isStepUp = (value: unknown): value is StepUpRequired => typeof value === "object" && value !== null && "stepUp" in value;

/** Motif des actions sensibles et critiques : facultatif (500 caractères au plus) ; absent, le journal note « (sans motif) ». */
export function reasonOf(value: unknown): string {
  const text = typeof value === "string" ? value.trim().split(/\s+/).join(" ") : "";
  return text ? text.slice(0, 500) : NO_REASON;
}

/** Motif à montrer à la personne : rien quand l'admin n'en a pas donné. */
export const shownReason = (motive: string) => (motive === NO_REASON ? "" : motive);

/** Personne ciblée par une action : jamais soi-même pour ce qui touche aux droits. */
export async function targetOf(id: unknown, admin: Pick<User, "id">, allowSelf = false) {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return null;
  if (!allowSelf && parsed.data === admin.id) return null;
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, parsed.data));
  return user ?? null;
}
