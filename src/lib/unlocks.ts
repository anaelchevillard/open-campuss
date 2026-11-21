/**
 * Déblocages de la personnalisation (pur) : des seuils, jamais d'achat. Le confort et l'accessibilité ne se débloquent jamais.
 * Un administrateur peut accorder un objet (table user_unlocks, `source = "admin"`).
 */
import { avatarFrameOf } from "@/lib/name-style";
// Ce que rapporte un cours publié (POINTS.cours dans gamification.ts, serveur seulement)
const POINTS_COURS = 30;

export type UnlockContext = {
  credits: number; published: number; badges: Set<string>; bestStreak: number; moderator: boolean; seasonTrophies: number;
  grants: Set<string>; bannerImages: boolean;
  /** Lien vers la demande la plus votée de sa matière, s'il y en a une */
  requestHref?: string;
};

export type UnlockId = "offert" | "vitrine" | "couleur-nom" | "couleurs-profil" | "badge-nom" | "banniere" | "banniere-image" | "police-nom" | "police-mono" | "police-caveat"
  | "degrade-nom" | "cadre-rarete" | "cadre-serie" | "cadre-bouclier" | "cadre-laurier" | "cadre-plume" | "cadre-anime" | "banniere-animee" | "effets";

export type UnlockState = { id: UnlockId; label: string; open: boolean; condition: string; hint?: string; path?: string; value: number; target: number };

const credits = (ctx: UnlockContext, target: number) => {
  const missing = Math.max(0, target - ctx.credits);
  const courses = Math.ceil(missing / POINTS_COURS);
  return {
    open: ctx.credits >= target, value: Math.min(ctx.credits, target), target,
    condition: `${target} crédits`,
    hint: missing ? `Encore ${courses} cours publié${courses > 1 ? "s" : ""} environ` : undefined,
    path: ctx.requestHref ?? "/contribuer",
  };
};
const badge = (ctx: UnlockContext, id: string, name: string) => ({ open: ctx.badges.has(id), value: ctx.badges.has(id) ? 1 : 0, target: 1, condition: `Badge « ${name} »` });
/** Des crédits, ou un palier du trophée « Correcteur » : corriger les cours des autres ouvre aussi la personnalisation. */
const creditsOrBadge = (ctx: UnlockContext, target: number, id: string, name: string) => {
  const c = credits(ctx, target);
  return ctx.badges.has(id) ? { ...c, open: true, value: c.target } : { ...c, condition: `${c.condition} · ou badge « ${name} »` };
};

const RULES: Record<UnlockId, { label: string; check: (ctx: UnlockContext) => Omit<UnlockState, "id" | "label"> }> = {
  // Ce qu'un compte tout neuf peut déjà choisir : quelques teintes, deux polices, trois bannières, deux cadres
  "offert": { label: "Offert", check: () => ({ open: true, value: 1, target: 1, condition: "Offert" }) },
  "vitrine": { label: "Vitrine", check: (ctx) => ({ open: ctx.published >= 1, value: Math.min(ctx.published, 1), target: 1, condition: "Publie un premier cours", path: ctx.requestHref ?? "/contribuer" }) },
  "couleur-nom": { label: "Couleur du nom", check: (ctx) => credits(ctx, 30) },
  "couleurs-profil": { label: "Couleurs du profil", check: (ctx) => credits(ctx, 30) },
  "badge-nom": { label: "Badge à côté du nom", check: (ctx) => ({ open: ctx.badges.size > 0, value: Math.min(ctx.badges.size, 1), target: 1, condition: "Obtiens un premier badge" }) },
  "banniere": { label: "Bannière", check: (ctx) => credits(ctx, 60) },
  "banniere-image": { label: "Image de bannière", check: (ctx) => ctx.bannerImages ? credits(ctx, 180) : { open: false, value: 0, target: 1, condition: "Indisponible" } },
  "police-nom": { label: "Police du nom", check: (ctx) => creditsOrBadge(ctx, 60, "correcteur-2", "Correcteur II") },
  "police-mono": { label: "JetBrains Mono", check: (ctx) => badge(ctx, "fiches-500", "Mémoire vive") },
  "police-caveat": { label: "Caveat", check: (ctx) => badge(ctx, "scribe-3", "Scribe III") },
  "degrade-nom": { label: "Dégradé du nom", check: (ctx) => creditsOrBadge(ctx, 180, "correcteur-3", "Correcteur III") },
  "cadre-rarete": { label: "Cadre de rareté", check: (ctx) => ({ open: ctx.badges.size > 0, value: Math.min(ctx.badges.size, 1), target: 1, condition: "Obtiens un premier badge" }) },
  "cadre-serie": { label: "Cadre de série", check: (ctx) => ({ open: ctx.bestStreak >= 7, value: Math.min(ctx.bestStreak, 7), target: 7, condition: "Révise 7 jours d’affilée", path: "/reviser" }) },
  "cadre-bouclier": { label: "Cadre bouclier", check: (ctx) => ({ open: ctx.moderator || ctx.badges.has("sentinelle"), value: ctx.moderator || ctx.badges.has("sentinelle") ? 1 : 0, target: 1, condition: "Délégué, ou badge « Sentinelle »" }) },
  "cadre-laurier": { label: "Cadre laurier", check: (ctx) => ({ open: ctx.seasonTrophies > 0, value: Math.min(ctx.seasonTrophies, 1), target: 1, condition: "Un trophée de saison", path: "/reviser/classement" }) },
  "cadre-plume": { label: "Cadre plume", check: (ctx) => ({ ...badge(ctx, "correcteur-1", "Correcteur I"), path: "/matieres" }) },
  "cadre-anime": { label: "Cadre animé", check: (ctx) => credits(ctx, 150) },
  "banniere-animee": { label: "Bannière animée", check: (ctx) => credits(ctx, 120) },
  "effets": { label: "Effets", check: (ctx) => { const c = credits(ctx, 300); return ctx.seasonTrophies > 0 ? { ...c, open: true, value: c.target } : { ...c, condition: `${c.condition} · ou un trophée de saison` }; } },
};

export const UNLOCK_IDS = Object.keys(RULES) as UnlockId[];

export function unlockState(id: UnlockId, ctx: UnlockContext): UnlockState {
  const rule = RULES[id];
  const result = rule.check(ctx);
  // Un objet accordé par un administrateur reste à la personne, quels que soient ses chiffres
  return ctx.grants.has(id) ? { id, label: rule.label, ...result, open: true } : { id, label: rule.label, ...result };
}

export const unlocks = (ctx: UnlockContext) => Object.fromEntries(UNLOCK_IDS.map((id) => [id, unlockState(id, ctx)])) as Record<UnlockId, UnlockState>;

/** Teintes offertes à tous, pour le nom comme pour la carte. */
export const FREE_HUES = new Set([20, 135, 210, 320]);
const FREE_FONTS = new Set(["serif", "nunito"]);
const FREE_BANNERS = new Set(["aurore", "lagune", "points"]);

/** Ce qu'il faut débloquer pour une police de nom donnée. */
export const fontUnlock = (font: string): UnlockId => (FREE_FONTS.has(font) ? "offert" : font === "mono" ? "police-mono" : font === "caveat" ? "police-caveat" : "police-nom");
/** Ce qu'il faut débloquer pour une couleur de nom. */
export const hueUnlock = (hue: number): UnlockId => (FREE_HUES.has(hue) ? "offert" : "couleur-nom");
/** Ce qu'il faut débloquer pour un fond de carte. */
export const cardUnlock = (hue: number): UnlockId => (FREE_HUES.has(hue) ? "offert" : "couleurs-profil");
/** Ce qu'il faut débloquer pour une bannière (dégradé, motif ou animée). */
export const bannerUnlock = (id: string, kind: string): UnlockId => (FREE_BANNERS.has(id) ? "offert" : kind === "animated" ? "banniere-animee" : "banniere");
/** Ce qu'il faut débloquer pour un cadre donné. */
export const frameUnlock = (frame: string): UnlockId | null => {
  const found = avatarFrameOf(frame);
  if (!found) return null;
  // Tous les cadres animés suivent la même règle (Comète, Orbite, Aurore, Pulsation, Éclats, Ligne de vol, Prisme)
  if (found.animated) return "cadre-anime";
  return ({ anneau: "offert", duo: "offert", rarete: "cadre-rarete", serie: "cadre-serie", bouclier: "cadre-bouclier", laurier: "cadre-laurier", plume: "cadre-plume" } as Record<string, UnlockId>)[found.id] ?? null;
};
