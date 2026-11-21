import "server-only";
import { and, desc, eq, gte, ilike, inArray, isNotNull, lt, or, type SQL } from "drizzle-orm";
import { db, schema } from "./db";
import { ADMIN_ACTIONS } from "./admin-actions";

const { auditLog } = schema;
export const JOURNAL_PAGE = 50;

/** Journal filtré : admin, type d'action, cible, période, critiques seulement, pendant un voir comme. */
export function journalWhere(p: Record<string, string | undefined>): SQL | undefined {
  const kinds = (p.type ?? "").split(",").filter(Boolean);
  const actions = kinds.length ? Object.entries(ADMIN_ACTIONS).filter(([, v]) => kinds.includes(v.kind)).map(([k]) => k) : [];
  const days = Number(p.periode);
  const like = p.q ? `%${p.q.trim().slice(0, 80).replace(/[%_\\]/g, "\\$&")}%` : null;
  return and(
    p.admin ? inArray(auditLog.actorId, p.admin.split(",")) : undefined,
    actions.length ? inArray(auditLog.action, actions) : undefined,
    p.cible ? eq(auditLog.targetId, p.cible) : undefined,
    like ? or(ilike(auditLog.targetLabel, like), ilike(auditLog.target, like), ilike(auditLog.reason, like), ilike(auditLog.actor, like)) : undefined,
    days > 0 ? gte(auditLog.at, new Date(Date.now() - days * 86_400_000)) : undefined,
    p.niveau === "critique" ? eq(auditLog.level, "critical") : p.niveau === "sensible" ? inArray(auditLog.level, ["sensitive", "critical"]) : undefined,
    p.apercu === "oui" ? isNotNull(auditLog.impersonationId) : undefined,
  );
}

export async function journalPage(p: Record<string, string | undefined>) {
  const page = Math.max(1, Number(p.page) || 1);
  const where = journalWhere(p);
  const rows = await db.select().from(auditLog).where(where).orderBy(desc(auditLog.id)).limit(JOURNAL_PAGE + 1).offset((page - 1) * JOURNAL_PAGE);
  return { page, rows: rows.slice(0, JOURNAL_PAGE), more: rows.length > JOURNAL_PAGE };
}

export async function journalAdmins() {
  return db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.role, "admin"));
}

export const olderThan = (days: number) => lt(auditLog.at, new Date(Date.now() - days * 86_400_000));
