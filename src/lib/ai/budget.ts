/** Règles du budget quotidien de Campuss IA, sans base : la page Système, les alertes et les tests s'en servent. */

/** Part du budget à partir de laquelle les administrateurs sont prévenus. */
export const AI_BUDGET_ALERT_RATIO = 0.8;

/** Durée de la pause après un refus du fournisseur (crédit épuisé, clé refusée). */
export const AI_SUSPENSION_MINUTES = 30;

export type BudgetLevel = "ok" | "alert" | "over";

export function budgetLevel(usedTokens: number, budget: number): BudgetLevel {
  if (usedTokens >= budget) return "over";
  return usedTokens >= budget * AI_BUDGET_ALERT_RATIO ? "alert" : "ok";
}

export const budgetPercent = (usedTokens: number, budget: number) => Math.min(999, Math.round((usedTokens / budget) * 100));

export type AiPauseReason = "budget" | "suspended";

export const AI_PAUSE_MESSAGES: Record<AiPauseReason, string> = {
  budget: "Campuss IA a atteint sa limite du jour pour tout le site. Elle revient à minuit.",
  suspended: "Campuss IA est en pause à cause d’un souci chez notre fournisseur. L’équipe est prévenue : réessaie dans une demi-heure.",
};
