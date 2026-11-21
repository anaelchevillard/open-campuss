/**
 * Badges (pur, utilisable côté client) : paliers, rareté fixe, progression. Le calcul des chiffres vit dans gamification.ts.
 * Les anciens identifiants restent des alias : un badge acquis sous l'ancien nom n'est jamais perdu.
 */
export type Stats = {
  byCategory: Record<string, number>; published: number; subjects: number; thanksReceived: number; thanksGiven: number;
  revised: number; reportsAccepted: number; profileComplete: boolean; pioneer: boolean; credits: number;
  bestStreak: number; cardsReviewed: number; friends: number; bigGroup: boolean; duelsWon: number; mockBest: number; sharedAnnotations: number;
  /** Modifications acceptées sur les cours des autres */
  corrections: number;
};

export type Rarity = "commun" | "rare" | "epique" | "legendaire" | "special";
export const RARITIES: Record<Rarity, { label: string; rank: number; shape: "rond" | "hexagone" | "etoile" | "ecusson" }> = {
  commun: { label: "Commun", rank: 1, shape: "rond" },
  rare: { label: "Rare", rank: 2, shape: "hexagone" },
  epique: { label: "Épique", rank: 3, shape: "hexagone" },
  legendaire: { label: "Légendaire", rank: 4, shape: "etoile" },
  special: { label: "Spécial", rank: 5, shape: "ecusson" },
};

export type BadgeIcon = "carte" | "pionnier" | "plume" | "fiche" | "archive" | "matieres" | "merci" | "coeur" | "revise" | "sentinelle" | "serie" | "cartes" | "partiel" | "ami" | "groupe" | "defi" | "note" | "etoile" | "correcteur";

export type Badge = {
  id: string; name: string; hint: string; icon: BadgeIcon; rarity: Rarity;
  /** Teinte propre du badge (oklch) : chaque badge a sa couleur ; la rareté garde la forme et son mot. Une suite de paliers partage la sienne. */
  hue: number;
  /** Suite de paliers (Scribe I, II, III) */
  track?: string; tier?: number;
  aliases?: string[];
  progress: (s: Stats) => { value: number; target: number };
};

const at = (value: number, target: number) => ({ value: Math.min(value, target), target });
const yes = (ok: boolean) => ({ value: ok ? 1 : 0, target: 1 });

export const BADGES: Badge[] = [
  { id: "carte-etudiante", name: "Carte étudiante", hint: "Ajouter une photo et une description", icon: "carte", rarity: "commun", hue: 230, progress: (s) => yes(s.profileComplete) },
  { id: "pionnier", name: "Pionnier", hint: "Être parmi les 30 premiers de sa licence", icon: "pionnier", rarity: "epique", hue: 300, progress: (s) => yes(s.pioneer) },
  { id: "scribe-1", name: "Scribe I", hint: "Publier un premier document", icon: "plume", rarity: "commun", hue: 45, track: "scribe", tier: 1, aliases: ["premier-cours"], progress: (s) => at(s.published, 1) },
  { id: "scribe-2", name: "Scribe II", hint: "Publier 5 cours", icon: "plume", rarity: "rare", hue: 45, track: "scribe", tier: 2, aliases: ["scribe"], progress: (s) => at(s.byCategory.cours ?? 0, 5) },
  { id: "scribe-3", name: "Scribe III", hint: "Publier 15 cours", icon: "plume", rarity: "legendaire", hue: 45, track: "scribe", tier: 3, aliases: ["plume-d-or"], progress: (s) => at(s.byCategory.cours ?? 0, 15) },
  { id: "fiche-ou-rien", name: "Fiche ou rien", hint: "Publier 5 fiches de révision", icon: "fiche", rarity: "rare", hue: 165, progress: (s) => at(s.byCategory.fiche ?? 0, 5) },
  { id: "annales", name: "Gardien des annales", hint: "Publier un ancien partiel autorisé", icon: "archive", rarity: "rare", hue: 80, progress: (s) => at(s.byCategory.partiel ?? 0, 1) },
  { id: "touche-a-tout", name: "Touche-à-tout", hint: "Publier dans 4 matières différentes", icon: "matieres", rarity: "epique", hue: 275, progress: (s) => at(s.subjects, 4) },
  { id: "merci-1", name: "Merci I", hint: "Recevoir un merci", icon: "merci", rarity: "commun", hue: 350, track: "merci", tier: 1, aliases: ["premier-merci"], progress: (s) => at(s.thanksReceived, 1) },
  { id: "merci-2", name: "Merci II", hint: "Recevoir 10 mercis", icon: "merci", rarity: "rare", hue: 350, track: "merci", tier: 2, aliases: ["reconnaissance"], progress: (s) => at(s.thanksReceived, 10) },
  { id: "merci-3", name: "Merci III", hint: "Recevoir 50 mercis", icon: "merci", rarity: "legendaire", hue: 350, track: "merci", tier: 3, aliases: ["bienfaiteur"], progress: (s) => at(s.thanksReceived, 50) },
  { id: "bonne-ame", name: "Bonne âme", hint: "Remercier 10 fois", icon: "coeur", rarity: "commun", hue: 15, progress: (s) => at(s.thanksGiven, 10) },
  { id: "revision-1", name: "Révision I", hint: "Marquer 10 documents comme révisés", icon: "revise", rarity: "commun", hue: 145, track: "revision", tier: 1, aliases: ["reviseur"], progress: (s) => at(s.revised, 10) },
  { id: "revision-2", name: "Révision II", hint: "Marquer 50 documents comme révisés", icon: "revise", rarity: "rare", hue: 145, track: "revision", tier: 2, aliases: ["bosseur"], progress: (s) => at(s.revised, 50) },
  { id: "revision-3", name: "Révision III", hint: "Marquer 150 documents comme révisés", icon: "revise", rarity: "epique", hue: 145, track: "revision", tier: 3, progress: (s) => at(s.revised, 150) },
  { id: "sentinelle", name: "Sentinelle", hint: "Signaler une erreur confirmée", icon: "sentinelle", rarity: "rare", hue: 215, progress: (s) => at(s.reportsAccepted, 1) },
  { id: "serie-7", name: "Série de 7", hint: "Réviser 7 jours d’affilée", icon: "serie", rarity: "commun", hue: 55, track: "serie", tier: 1, progress: (s) => at(s.bestStreak, 7) },
  { id: "serie-30", name: "Série de 30", hint: "Réviser 30 jours d’affilée", icon: "serie", rarity: "epique", hue: 55, track: "serie", tier: 2, progress: (s) => at(s.bestStreak, 30) },
  { id: "serie-100", name: "Série de 100", hint: "Réviser 100 jours d’affilée", icon: "serie", rarity: "legendaire", hue: 55, track: "serie", tier: 3, progress: (s) => at(s.bestStreak, 100) },
  { id: "fiches-500", name: "Mémoire vive", hint: "Revoir 500 fiches", icon: "cartes", rarity: "rare", hue: 195, track: "fiches", tier: 1, progress: (s) => at(s.cardsReviewed, 500) },
  { id: "fiches-2000", name: "Mémoire d’éléphant", hint: "Revoir 2 000 fiches", icon: "cartes", rarity: "epique", hue: 195, track: "fiches", tier: 2, progress: (s) => at(s.cardsReviewed, 2000) },
  { id: "partiel-blanc", name: "Partiel blanc", hint: "Réussir un partiel blanc à 80 %", icon: "partiel", rarity: "rare", hue: 260, progress: (s) => at(s.mockBest, 80) },
  { id: "premier-ami", name: "Premier ami", hint: "Avoir un ami sur Campuss", icon: "ami", rarity: "commun", hue: 325, progress: (s) => at(s.friends, 1) },
  { id: "groupe-4", name: "Groupe de 4", hint: "Réviser dans un groupe de 4", icon: "groupe", rarity: "rare", hue: 120, progress: (s) => yes(s.bigGroup) },
  { id: "defi-gagne", name: "Défi gagné", hint: "Gagner un défi", icon: "defi", rarity: "rare", hue: 28, progress: (s) => at(s.duelsWon, 1) },
  { id: "correcteur-1", name: "Correcteur I", hint: "Faire accepter une modification d’un cours", icon: "correcteur", rarity: "commun", hue: 100, track: "correcteur", tier: 1, progress: (s) => at(s.corrections, 1) },
  { id: "correcteur-2", name: "Correcteur II", hint: "Faire accepter 5 modifications", icon: "correcteur", rarity: "rare", hue: 100, track: "correcteur", tier: 2, progress: (s) => at(s.corrections, 5) },
  { id: "correcteur-3", name: "Correcteur III", hint: "Faire accepter 20 modifications", icon: "correcteur", rarity: "epique", hue: 100, track: "correcteur", tier: 3, progress: (s) => at(s.corrections, 20) },
  { id: "annotateur", name: "Annotateur", hint: "Partager une note sur un cours", icon: "note", rarity: "commun", hue: 240, progress: (s) => at(s.sharedAnnotations, 1) },
];

const BY_ID = new Map<string, Badge>();
for (const badge of BADGES) for (const id of [badge.id, ...(badge.aliases ?? [])]) BY_ID.set(id, badge);

/** Le badge d'un identifiant, ancien nom compris. */
export const badgeOf = (id: string | null | undefined) => (id ? BY_ID.get(id) : undefined);
/** Identifiants à viser pour retirer un badge : le sien et ses alias. */
export const badgeRowIds = (id: string) => { const badge = badgeOf(id); return badge ? [badge.id, ...(badge.aliases ?? [])] : [id]; };
/** Couleur d'une teinte de badge, lisible en clair et en sombre (contour et icône, fond du disque). */
export const badgeColors = (hue: number) => ({
  "--b": `light-dark(oklch(0.5 0.14 ${hue}), oklch(0.8 0.12 ${hue}))`,
  "--b-tint": `light-dark(oklch(0.95 0.04 ${hue}), oklch(0.3 0.06 ${hue}))`,
});
export const isEarned = (badge: Badge, s: Stats) => { const p = badge.progress(s); return p.value >= p.target; };

export type EarnedRow = { badge: string; earnedAt: Date; grantedBy?: string | null };
export type BadgeView = { badge: Badge; earnedAt: Date | null; manual: boolean; value: number; target: number };

/** Lignes en base (alias résolus) → badges obtenus d'abord (rareté puis date), puis verrouillés par progression. */
export function badgeBoard(rows: EarnedRow[], stats: Stats | null): BadgeView[] {
  const earned = new Map<string, EarnedRow>();
  for (const row of rows) {
    const badge = badgeOf(row.badge);
    if (!badge) continue;
    const before = earned.get(badge.id);
    if (!before || row.earnedAt < before.earnedAt) earned.set(badge.id, row);
  }
  const views = BADGES.map((badge): BadgeView => {
    const row = earned.get(badge.id);
    const p = stats ? badge.progress(stats) : { value: 0, target: 1 };
    return { badge, earnedAt: row?.earnedAt ?? null, manual: Boolean(row?.grantedBy), value: row ? p.target : p.value, target: p.target };
  });
  const rank = (v: BadgeView) => (v.manual ? RARITIES.special.rank : RARITIES[v.badge.rarity].rank);
  const got = views.filter((v) => v.earnedAt).sort((a, b) => rank(b) - rank(a) || b.earnedAt!.getTime() - a.earnedAt!.getTime());
  const locked = views.filter((v) => !v.earnedAt).sort((a, b) => b.value / b.target - a.value / a.target || RARITIES[a.badge.rarity].rank - RARITIES[b.badge.rarity].rank);
  return [...got, ...locked];
}

export const rarityOf = (view: Pick<BadgeView, "badge" | "manual">): Rarity => (view.manual ? "special" : view.badge.rarity);
