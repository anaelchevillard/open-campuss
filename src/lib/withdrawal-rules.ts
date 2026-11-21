/**
 * Une fois un cours publié, son auteur étudiant ne le retire plus seul (corbeille, retrait de la
 * publication, suppression). Il demande le retrait à l'administration, avec une justification.
 */
export const WITHDRAWAL_REASON_MIN = 15;
export const WITHDRAWAL_REASON_MAX = 1000;
export const WITHDRAWAL_RESPONSE_MIN = 3;
export const WITHDRAWALS_PER_DAY = 5;

/** Rôles qui gardent la main sur leurs cours publiés. */
const STAFF = new Set(["admin", "delegate", "teacher"]);

/** Retirer soi-même un document : tant qu'il n'est pas publié, ou pour l'administration, un délégué ou un enseignant. */
export function canWithdrawDirectly(user: { role: string }, doc: { published: boolean }) {
  return !doc.published || STAFF.has(user.role);
}

/** La justification : une vraie phrase, pas un caractère. `null` si elle est trop courte. */
export function cleanWithdrawalReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim().slice(0, WITHDRAWAL_REASON_MAX);
  return text.length >= WITHDRAWAL_REASON_MIN ? text : null;
}

/** Le motif d'un refus, obligatoire ; facultatif pour une acceptation. */
export function cleanWithdrawalResponse(raw: unknown, decision: "accept" | "refuse"): string | null | false {
  const text = typeof raw === "string" ? raw.trim().slice(0, WITHDRAWAL_REASON_MAX) : "";
  if (decision === "refuse" && text.length < WITHDRAWAL_RESPONSE_MIN) return false;
  return text || null;
}

export const WITHDRAW_REFUSED = "Ce cours est publié : demande son retrait à l’administration, avec une justification.";
