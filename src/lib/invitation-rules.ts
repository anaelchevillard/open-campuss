/** Règles pures des invitations : lecture d'une liste collée ou d'un CSV, aperçu avant envoi (testées sans base). */

export type InviteRow = { line: number; email: string; name: string; program: string; level: number | null; status: "ok" | "invalid" | "registered" | "duplicate"; problem?: string };

const EMAIL = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;

/**
 * Une adresse par ligne, ou « adresse;nom;licence;année » (virgule, point-virgule ou tabulation). Les doublons sont
 * fusionnés (la première ligne l'emporte), les adresses déjà inscrites sont signalées, les invalides gardées pour l'aperçu.
 */
export function parseInviteList(text: string, registered: Set<string>, max = 500): InviteRow[] {
  const rows: InviteRow[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, max + 1);
  lines.forEach((raw, index) => {
    if (index === 0 && /^(adresse|e-?mail|courriel)\b/i.test(raw)) return;
    const cells = raw.split(/[;\t]|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const email = (cells[0] ?? "").toLowerCase();
    const level = /^L?([123])$/i.exec(cells[3] ?? "")?.[1];
    const row: InviteRow = { line: index + 1, email, name: (cells[1] ?? "").slice(0, 80), program: (cells[2] ?? "").slice(0, 80), level: level ? Number(level) : null, status: "ok" };
    if (!EMAIL.test(email) || email.length > 254) { row.status = "invalid"; row.problem = "Adresse invalide"; }
    else if (seen.has(email)) row.status = "duplicate";
    else if (registered.has(email)) row.status = "registered";
    seen.add(email);
    rows.push(row);
  });
  return rows;
}

export const sendable = (rows: InviteRow[]) => rows.filter((r) => r.status === "ok");

/** Ce que la file plafonnée enverra aujourd'hui, et le reste. */
export function queuePlan(count: number, sentToday: number, dailyLimit: number) {
  const today = Math.max(0, Math.min(count, dailyLimit - sentToday));
  return { today, later: count - today, days: count - today > 0 ? Math.ceil((count - today) / Math.max(1, dailyLimit)) : 0 };
}

export type InvitationState = "queued" | "sent" | "opened" | "accepted" | "expired" | "revoked" | "open-link";

export function invitationState(inv: { email: string | null; sentAt: Date | null; openedAt: Date | null; acceptedAt: Date | null; expiresAt: Date; revokedAt: Date | null; uses: number; maxUses: number }, now = new Date()): InvitationState {
  if (inv.revokedAt) return "revoked";
  if (!inv.email) return inv.expiresAt < now || inv.uses >= inv.maxUses ? "expired" : "open-link";
  if (inv.acceptedAt) return "accepted";
  if (inv.expiresAt < now) return "expired";
  if (inv.openedAt) return "opened";
  return inv.sentAt ? "sent" : "queued";
}
