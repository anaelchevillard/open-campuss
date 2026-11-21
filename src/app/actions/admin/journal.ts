"use server";

import { desc } from "drizzle-orm";
import { adminFor, isStepUp, reasonOf, type AdminResult } from "@/lib/admin-ops";
import { actionLabel } from "@/lib/admin-actions";
import { auditAction } from "@/lib/audit";
import { journalWhere } from "@/lib/admin-journal";
import { db, schema } from "@/lib/db";

/** Export CSV du journal filtré (sensible, lui-même journalisé). 5000 lignes au plus. */
export async function exportJournal(filters: Record<string, string>, reason: string): Promise<AdminResult<string>> {
  const admin = await adminFor("sensitive");
  if (isStepUp(admin)) return admin;
  const motive = reasonOf(reason);
  const rows = await db.select().from(schema.auditLog).where(journalWhere(filters)).orderBy(desc(schema.auditLog.id)).limit(5000);
  const cell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""').replace(/^[=+\-@]/, "'$&")}"`;
  const csv = ["date;admin;action;niveau;cible;motif;ip", ...rows.map((r) => [r.at.toISOString(), r.actor, actionLabel(r.action), r.level ?? "", r.targetLabel ?? r.target, r.reason ?? "", r.ip].map(cell).join(";"))].join("\n");
  await auditAction(admin, { action: "journal.export", target: { type: "site", id: "journal", label: `${rows.length} lignes` }, reason: motive, after: filters });
  return { data: csv };
}
