/**
 * Personnalisation visible par les autres (DESIGN.md §2.6 et §10) : listes fermées, jamais d'hexadécimal libre.
 * Pur : utilisé par le serveur (validation), l'aperçu en direct et les tests de contraste.
 */
import type { NameStyle, ProfileBanner, ProfileStatus } from "@/lib/db/schema";

export type Hue = { h: number; label: string };

/** 12 teintes, aucune entre 250 et 290 (elles éteindraient l'IA). */
export const NAME_HUES: Hue[] = [
  { h: 0, label: "Cerise" }, { h: 20, label: "Corail" }, { h: 45, label: "Orange" }, { h: 70, label: "Ambre" },
  { h: 100, label: "Olive" }, { h: 135, label: "Vert" }, { h: 160, label: "Émeraude" }, { h: 185, label: "Sarcelle" },
  { h: 210, label: "Ciel" }, { h: 230, label: "Bleu" }, { h: 320, label: "Magenta" }, { h: 350, label: "Framboise" },
];
const HUE_SET = new Set(NAME_HUES.map((hue) => hue.h));

/** Dégradés de nom : deux arrêts statiques, jamais la suite IA. */
export const NAME_GRADIENTS: { id: string; label: string; from: number; to: number }[] = [
  { id: "braise", label: "Braise", from: 20, to: 45 }, { id: "foret", label: "Forêt", from: 135, to: 185 },
  { id: "lagon", label: "Lagon", from: 185, to: 210 }, { id: "aube", label: "Aube", from: 45, to: 350 },
  { id: "ardoise", label: "Ardoise", from: 210, to: 230 }, { id: "miel", label: "Miel", from: 70, to: 45 },
  { id: "menthe", label: "Menthe", from: 160, to: 185 }, { id: "cerise", label: "Cerise", from: 0, to: 20 },
];

/** Polices de nom, compensées dans name-fonts.css pour garder la hauteur d'x de Source Sans 3. */
export const NAME_FONTS: { id: string; label: string; family: string }[] = [
  { id: "massilia", label: "Massilia", family: "\"Nom Massilia\"" },
  { id: "serif", label: "Source Serif", family: "\"Source Serif 4\"" },
  { id: "mono", label: "JetBrains Mono", family: "\"Nom JetBrains Mono\"" },
  { id: "caveat", label: "Caveat", family: "\"Nom Caveat\"" },
  { id: "nunito", label: "Nunito", family: "\"Nom Nunito\"" },
  { id: "condensed", label: "Barlow Condensed", family: "\"Nom Barlow Condensed\"" },
];

export const NAME_EFFECTS = [{ id: "reflet", label: "Reflet sur le nom" }] as const;
/** Lueurs du cadre : « lueur » respire (animée, immobile en mouvement réduit), « halo » est fixe, sans animation. */
export const AVATAR_EFFECTS = [{ id: "lueur", label: "Lueur qui respire" }, { id: "halo", label: "Lueur fixe" }] as const;
export type AvatarEffect = (typeof AVATAR_EFFECTS)[number]["id"];
export const isAvatarEffect = (value: unknown): value is AvatarEffect => AVATAR_EFFECTS.some((e) => e.id === value);

/**
 * Cadres d'avatar : deux offerts, cinq gagnés autrement que par des crédits, sept animés (déblocage « Cadre animé »).
 * Les animés ne bougent que par transform et opacity, et restent fixes en mouvement réduit (name-fonts.css).
 * Liste fermée : le serveur refuse tout autre identifiant (avatarFrameOf).
 */
export const AVATAR_FRAMES: readonly { id: string; label: string; animated?: boolean }[] = [
  { id: "anneau", label: "Anneau" }, { id: "duo", label: "Duo" },
  { id: "rarete", label: "Rareté" }, { id: "serie", label: "Série" }, { id: "bouclier", label: "Bouclier" }, { id: "laurier", label: "Laurier" }, { id: "plume", label: "Plume" },
  { id: "comete", label: "Comète", animated: true }, { id: "orbite", label: "Orbite", animated: true }, { id: "aurore", label: "Aurore", animated: true },
  { id: "pulsation", label: "Pulsation", animated: true }, { id: "eclats", label: "Éclats", animated: true }, { id: "vol", label: "Ligne de vol", animated: true },
  { id: "prisme", label: "Prisme", animated: true },
];

/** Le cadre de la liste qui porte cet identifiant, sinon null (identifiant inconnu, vide ou d'un autre type). */
export const avatarFrameOf = (value: unknown) => (typeof value === "string" ? AVATAR_FRAMES.find((f) => f.id === value) ?? null : null);

/** Bannières : dégradés et motifs posés sur deux teintes de la liste ; les animées dérivent lentement (24 s), immobiles en mouvement réduit. */
export const BANNERS: { id: string; label: string; kind: "gradient" | "pattern" | "animated"; a: number; b: number; c?: number }[] = [
  { id: "aurore", label: "Aurore", kind: "gradient", a: 350, b: 45 },
  { id: "lagune", label: "Lagune", kind: "gradient", a: 185, b: 230 },
  { id: "sous-bois", label: "Sous-bois", kind: "gradient", a: 135, b: 100 },
  { id: "crepuscule", label: "Crépuscule", kind: "gradient", a: 230, b: 320 },
  { id: "braise", label: "Braise", kind: "gradient", a: 0, b: 45 },
  { id: "givre", label: "Givre", kind: "gradient", a: 210, b: 160 },
  { id: "points", label: "Points", kind: "pattern", a: 210, b: 230 },
  { id: "rayures", label: "Rayures", kind: "pattern", a: 20, b: 350 },
  { id: "quadrillage", label: "Quadrillage", kind: "pattern", a: 160, b: 185 },
  { id: "vagues", label: "Vagues", kind: "pattern", a: 320, b: 350 },
  { id: "boreale", label: "Boréale", kind: "animated", a: 160, b: 210, c: 320 },
  { id: "lave", label: "Lave", kind: "animated", a: 0, b: 45, c: 20 },
  { id: "ocean", label: "Océan", kind: "animated", a: 185, b: 230, c: 210 },
  { id: "constellation", label: "Constellation", kind: "animated", a: 230, b: 320, c: 230 },
];

// Clarté imposée par le thème : 4,5:1 garanti sur --card (DESIGN.md §2.6)
export const NAME_LIGHT = { l: 0.48, c: 0.16 };
export const NAME_DARK = { l: 0.8, c: 0.12 };

export const hueColor = (h: number) => `light-dark(oklch(${NAME_LIGHT.l} ${NAME_LIGHT.c} ${h}), oklch(${NAME_DARK.l} ${NAME_DARK.c} ${h}))`;

/** Fond de carte teinté (couleurs du profil) et sa pastille dans le choix. */
export const cardHueColor = (h: number) => `light-dark(oklch(0.975 0.018 ${h}), oklch(0.245 0.03 ${h}))`;
export const cardSwatchColor = (h: number) => `light-dark(oklch(0.93 0.05 ${h}), oklch(0.32 0.06 ${h}))`;

export const isHue = (value: unknown): value is number => typeof value === "number" && HUE_SET.has(value);
export const gradientOf = (id?: string) => NAME_GRADIENTS.find((g) => g.id === id);
export const fontOf = (id?: string) => NAME_FONTS.find((f) => f.id === id);
export const bannerOf = (id?: string) => BANNERS.find((b) => b.id === id);

/** Fond de bannière (dégradé ou motif) ; l'image passe par son URL. */
export function bannerBackground(banner: ProfileBanner | null | undefined, imageUrl?: string): string | undefined {
  if (!banner) return undefined;
  if (banner.kind === "image") return imageUrl ? `center / cover no-repeat url("${imageUrl}")` : undefined;
  const found = bannerOf(banner.value);
  if (!found) return undefined;
  const a = `light-dark(oklch(0.78 0.1 ${found.a}), oklch(0.42 0.1 ${found.a}))`;
  const b = `light-dark(oklch(0.7 0.12 ${found.b}), oklch(0.34 0.1 ${found.b}))`;
  const ink = `light-dark(oklch(1 0 0 / .32), oklch(1 0 0 / .1))`;
  if (found.kind === "gradient") return `linear-gradient(120deg, ${a}, ${b})`;
  if (found.kind === "animated") {
    const c = `light-dark(oklch(0.74 0.12 ${found.c ?? found.a}), oklch(0.38 0.1 ${found.c ?? found.a}))`;
    const drift = `linear-gradient(120deg, ${a}, ${b}, ${c}, ${a}) 0% 50% / 300% 300%`;
    if (found.id !== "constellation") return drift;
    return `radial-gradient(${ink} 1.5px, transparent 2px) 0 0 / 26px 26px, radial-gradient(${ink} 1px, transparent 1.5px) 13px 9px / 26px 26px, ${drift}`;
  }
  const base = `linear-gradient(120deg, ${a}, ${b})`;
  switch (found.id) {
    case "points": return `radial-gradient(${ink} 1.5px, transparent 2px) 0 0 / 14px 14px, ${base}`;
    case "rayures": return `repeating-linear-gradient(135deg, ${ink} 0 6px, transparent 6px 18px), ${base}`;
    case "quadrillage": return `linear-gradient(${ink} 1px, transparent 1px) 0 0 / 20px 20px, linear-gradient(90deg, ${ink} 1px, transparent 1px) 0 0 / 20px 20px, ${base}`;
    default: return `radial-gradient(circle at 50% 120%, transparent 14px, ${ink} 15px 17px, transparent 18px) 0 0 / 36px 18px, ${base}`;
  }
}

/** Bannière qui dérive lentement (classe CSS, coupée en mouvement réduit). */
export const bannerAnimated = (banner: ProfileBanner | null | undefined) => banner?.kind === "animated" && bannerOf(banner.value)?.kind === "animated";

/** Couleur de la carte de profil : un fond teinté pris dans les 12 teintes. */
export function profileColorVars(colors: Record<string, string> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const card = Number(colors?.card);
  if (colors?.card !== undefined && isHue(card)) out["--profile-card"] = cardHueColor(card);
  return out;
}

// ---------- Contraste (tests et garde-fous) ----------

/** OKLCH → sRGB (0 à 1), écrêté au gamut comme le fait le navigateur au plus simple. */
export function oklchToSrgb(l: number, c: number, h: number): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr), b = c * Math.sin(hr);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const [L, M, S] = [l_ ** 3, m_ ** 3, s_ ** 3];
  const lin = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  const gamma = (x: number) => { const v = Math.min(1, Math.max(0, x)); return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; };
  return [gamma(lin[0]), gamma(lin[1]), gamma(lin[2])];
}

const luminance = ([r, g, b]: [number, number, number]) => {
  const ch = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};
export const hexToRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
export function contrast(a: [number, number, number], b: [number, number, number]) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// ---------- Filtre des noms ----------

/**
 * Refuse ce qui sert à tricher visuellement : lettres mathématiques (𝓝𝓸𝓶), caractères invisibles,
 * empilements de diacritiques (zalgo), symboles de mise en forme. Renvoie le problème, ou null.
 */
export function nameProblem(raw: string): string | null {
  const name = raw.normalize("NFC");
  if (/[\u{1D400}-\u{1D7FF}\u{1F130}-\u{1F189}\u{24B6}-\u{24E9}\u{FF01}-\u{FF5E}]/u.test(name)) return "Utilise des lettres ordinaires, sans police spéciale";
  if (/[\p{Cf}\p{Cc}\p{Co}\p{Cs}\u{115F}\u{1160}\u{3164}\u{FFA0}\u{2800}]/u.test(name)) return "Ce nom contient des caractères invisibles";
  if (/\p{M}{3,}/u.test(name)) return "Trop d’accents empilés sur une lettre";
  if ((name.match(/\p{M}/gu)?.length ?? 0) > Math.max(4, name.length / 3)) return "Trop d’accents empilés";
  return null;
}

/** Nom propre : espaces simplifiés, 80 caractères. */
export const tidyName = (raw: string) => raw.normalize("NFC").trim().split(/\s+/).join(" ").slice(0, 80);

// ---------- Nettoyage de ce qui arrive du navigateur ----------

export function cleanNameStyle(raw: unknown): NameStyle {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: NameStyle = {};
  if (typeof v.font === "string" && fontOf(v.font)) out.font = v.font;
  if (isHue(v.hue)) out.hue = v.hue;
  if (typeof v.gradient === "string" && gradientOf(v.gradient)) out.gradient = v.gradient;
  if (v.effect === "reflet") out.effect = "reflet";
  return out;
}

export const STATUS_MAX = 60;
export const STATUS_DURATIONS = { heure: 3_600_000, jour: 0, semaine: 7 * 86_400_000 } as const;

/** Un emoji au plus, 60 caractères, une date d'expiration facultative. */
export function cleanStatus(raw: unknown): ProfileStatus | null {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const text = typeof v.text === "string" ? v.text.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, STATUS_MAX) : "";
  const emoji = typeof v.emoji === "string" ? [...new Intl.Segmenter("fr", { granularity: "grapheme" }).segment(v.emoji.trim())].map((s) => s.segment).find((s) => /\p{Extended_Pictographic}/u.test(s)) : undefined;
  if (!text && !emoji) return null;
  const expiresAt = typeof v.expiresAt === "string" && !Number.isNaN(Date.parse(v.expiresAt)) ? new Date(v.expiresAt).toISOString() : undefined;
  return { text, ...(emoji ? { emoji } : {}), ...(expiresAt ? { expiresAt } : {}) };
}

export const statusLive = (status: ProfileStatus | null | undefined, now = new Date()) => Boolean(status && (status.text || status.emoji) && (!status.expiresAt || new Date(status.expiresAt) > now));

/** Fin de la journée en cours, heure de Paris approximée par le fuseau du serveur. */
export function statusExpiry(choice: keyof typeof STATUS_DURATIONS | "jamais", now = new Date()): string | undefined {
  if (choice === "jamais") return undefined;
  if (choice === "jour") { const end = new Date(now); end.setHours(23, 59, 59, 0); return end.toISOString(); }
  return new Date(now.getTime() + STATUS_DURATIONS[choice]).toISOString();
}
