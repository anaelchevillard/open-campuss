/**
 * Quota d'IA par compte et par jour. Les crédits ne donnent accès à rien d'autre : les cours restent ouverts à tous.
 * Les paliers suivent les titres de LEVELS (gamification.ts), pour qu'un nouveau titre se sente tout de suite.
 */
export type AiUse = "pages" | "memo" | "suggest";
export type AiAllowance = Record<AiUse, number>;

export const AI_TIERS: ({ at: number } & AiAllowance)[] = [
  { at: 0, pages: 5, memo: 3, suggest: 10 },
  { at: 30, pages: 10, memo: 5, suggest: 15 },
  { at: 60, pages: 15, memo: 8, suggest: 20 },
  { at: 180, pages: 25, memo: 12, suggest: 30 },
  { at: 300, pages: 40, memo: 16, suggest: 40 },
  { at: 480, pages: 60, memo: 20, suggest: 50 },
];

// Un administrateur corrige et dépanne : il garde une marge, mais rien n'est illimité
const ADMIN_ALLOWANCE: AiAllowance = { pages: 500, memo: 100, suggest: 200 };

const tierIndex = (credits: number) => Math.max(0, AI_TIERS.findLastIndex((tier) => credits >= tier.at));

export function aiAllowance(credits: number, admin = false): AiAllowance {
  if (admin) return ADMIN_ALLOWANCE;
  const { pages, memo, suggest } = AI_TIERS[tierIndex(credits)];
  return { pages, memo, suggest };
}

export const nextAiTier = (credits: number) => AI_TIERS[tierIndex(credits) + 1] ?? null;

/** Le jour en France (Europe/Paris), pas celui du serveur : le compteur repart à minuit pour l'étudiant. */
export const quotaDay = (date: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(date);

export const quotaKey = (use: AiUse, userId: string, date: Date) => `ai:${use}:${userId}:${quotaDay(date)}`;

const NOUNS: Record<Exclude<AiUse, "suggest">, string> = { pages: "pages à transcrire", memo: "générations de fiches" };

/** Comment augmenter le quota, en une proposition. Vide au dernier palier : il n'y a rien à pousser. */
export function aiGrowth(use: Exclude<AiUse, "suggest">, credits: number, creditsPerCourse: number) {
  const next = nextAiTier(credits);
  return next ? `à ${next.at} crédits (un cours publié en rapporte ${creditsPerCourse}), tu passes à ${next[use]} ${NOUNS[use]} par jour` : "";
}

export function aiRefusal(use: Exclude<AiUse, "suggest">, limit: number, credits: number, creditsPerCourse: number) {
  const growth = aiGrowth(use, credits, creditsPerCourse);
  return `Tu as utilisé tes ${limit} ${NOUNS[use]} d’aujourd’hui : le compteur repart à minuit${growth ? `, et ${growth}` : ""}.`;
}
