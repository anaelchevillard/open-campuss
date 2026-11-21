import "server-only";
import { gte, sql } from "drizzle-orm";
import { alertAdminsDaily } from "../admin-alert";
import { quotaDay } from "../ai-quota";
import { db, schema } from "../db";
import { env } from "../env";
import { rateHit, rateLimited } from "../security";
import { getSetting } from "../site-settings";
import { AI_PAUSE_MESSAGES, AI_SUSPENSION_MINUTES, budgetLevel, budgetPercent, type AiPauseReason } from "./budget";

const { aiUsage } = schema;
// Hors du préfixe « ai: » : la page Système y lit la date du dernier appel
const SUSPENDED_KEY = "ia-suspendue";
const DAY_MS = 86_400_000;

async function todayTotals(day = quotaDay(new Date())) {
  const [row] = await db.select({
    tokens: sql<number>`coalesce(sum(${aiUsage.inputTokens} + ${aiUsage.outputTokens}), 0)::float`,
    calls: sql<number>`coalesce(sum(${aiUsage.calls}), 0)::int`,
  }).from(aiUsage).where(sql`${aiUsage.day} = ${day}`);
  return { tokens: Number(row?.tokens ?? 0), calls: Number(row?.calls ?? 0) };
}

/**
 * Pause de tout le site : refus du fournisseur (30 min), ou jusqu'à minuit si le budget de jetons (AI_DAILY_TOKEN_BUDGET)
 * ou le plafond d'appels (Réglages, « Plafond IA quotidien du site ») est atteint.
 */
export async function aiPause(): Promise<{ reason: AiPauseReason; message: string } | null> {
  if (await rateLimited(SUSPENDED_KEY, 1, AI_SUSPENSION_MINUTES)) return { reason: "suspended", message: AI_PAUSE_MESSAGES.suspended };
  const [today, maxCalls] = await Promise.all([todayTotals(), getSetting("quotas.aiDailyGlobal")]);
  if (budgetLevel(today.tokens, env.aiDailyTokenBudget) === "over" || today.calls >= maxCalls) return { reason: "budget", message: AI_PAUSE_MESSAGES.budget };
  return null;
}

/** Crédit épuisé ou clé refusée : inutile d'insister, chaque appel échouerait pareil. */
export async function suspendAi(status: number) {
  await rateHit(SUSPENDED_KEY);
  await alertAdminsDaily("ia-suspendue", {
    title: `${env.siteName} : Campuss IA suspendue (réponse ${status} du fournisseur)`,
    body: `Le fournisseur d’IA refuse les appels (crédit épuisé ou clé invalide). L’IA reste en pause ${AI_SUSPENSION_MINUTES} minutes puis réessaie. Vérifie AI_API_KEY et la facturation.`,
    href: "/admin/systeme",
  }).catch((error) => console.warn("alerte IA :", (error as Error).message));
}

export type AiSpend = { task: string; model: string; inputTokens: number; outputTokens: number; error: boolean };

/** Totaux du jour, sans personne : un appel, ses jetons, une erreur éventuelle. Puis alerte à 80 % et à 100 % du budget. */
export async function recordAiUsage(spend: AiSpend) {
  const day = quotaDay(new Date());
  const errors = spend.error ? 1 : 0;
  await db.insert(aiUsage).values({ day, task: spend.task, model: spend.model.slice(0, 80), calls: 1, inputTokens: spend.inputTokens, outputTokens: spend.outputTokens, errors }).onConflictDoUpdate({
    target: [aiUsage.day, aiUsage.task, aiUsage.model],
    set: { calls: sql`${aiUsage.calls} + 1`, inputTokens: sql`${aiUsage.inputTokens} + ${spend.inputTokens}`, outputTokens: sql`${aiUsage.outputTokens} + ${spend.outputTokens}`, errors: sql`${aiUsage.errors} + ${errors}` },
  });
  const budget = env.aiDailyTokenBudget;
  const used = (await todayTotals(day)).tokens;
  const level = budgetLevel(used, budget);
  if (level === "ok") return;
  await alertAdminsDaily(level === "over" ? "ia-budget-atteint" : "ia-budget-80", {
    title: `${env.siteName} : budget de Campuss IA ${level === "over" ? "atteint, IA en pause jusqu’à minuit" : `utilisé à ${budgetPercent(used, budget)} %`}`,
    body: `${Math.round(used).toLocaleString("fr-FR")} jetons utilisés aujourd’hui sur ${budget.toLocaleString("fr-FR")} (AI_DAILY_TOKEN_BUDGET).`,
    href: "/admin/systeme",
  }).catch((error) => console.warn("alerte IA :", (error as Error).message));
}

export type AiPeriod = { label: string; calls: number; inputTokens: number; outputTokens: number; errors: number };

/** Consommation sur 1, 7 et 30 jours, pour la page Système. */
export async function aiUsageSummary() {
  const now = Date.now();
  const since = (days: number) => quotaDay(new Date(now - (days - 1) * DAY_MS));
  const rows = await db.select().from(aiUsage).where(gte(aiUsage.day, since(30)));
  const period = (label: string, days: number): AiPeriod => rows.filter((r) => r.day >= since(days)).reduce((sum, r) => ({
    label, calls: sum.calls + r.calls, inputTokens: sum.inputTokens + r.inputTokens, outputTokens: sum.outputTokens + r.outputTokens, errors: sum.errors + r.errors,
  }), { label, calls: 0, inputTokens: 0, outputTokens: 0, errors: 0 });
  const periods = [period("Aujourd’hui", 1), period("7 jours", 7), period("30 jours", 30)];
  return { periods, budget: env.aiDailyTokenBudget, maxCalls: await getSetting("quotas.aiDailyGlobal"), used: periods[0].inputTokens + periods[0].outputTokens, pause: await aiPause() };
}
