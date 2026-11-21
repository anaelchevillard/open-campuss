/**
 * Choix et recadrage d'une image de profil (photo, bannière), côté navigateur (pur, testé).
 * Le fichier est refusé tout de suite s'il ne convient pas (type, poids, dimensions), avant tout envoi ;
 * le serveur garde ses propres vérifications (poids, cleanImage, déblocage, quotas).
 */

export type ImageKind = "avatar" | "banner";

export type ImageRule = {
  /** Largeur / hauteur attendue */
  ratio: number;
  /** Plus petite image acceptée, et plus petit recadrage permis (le zoom s'arrête là) */
  minWidth: number; minHeight: number;
  /** Taille envoyée (jamais agrandie) */
  outWidth: number; outHeight: number;
  label: string;
};

export const IMAGE_RULES: Record<ImageKind, ImageRule> = {
  avatar: { ratio: 1, minWidth: 128, minHeight: 128, outWidth: 512, outHeight: 512, label: "La photo" },
  // Bannière : 4 sur 1, entre l'en-tête du téléphone (≈ 3,2) et celui de l'ordinateur (≈ 6), posée en `cover`
  banner: { ratio: 4, minWidth: 600, minHeight: 150, outWidth: 1600, outHeight: 400, label: "La bannière" },
};

/** Formats que tous les navigateurs savent lire et que le serveur accepte (pas de HEIC, pas de SVG). */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const IMAGE_ACCEPT = IMAGE_TYPES.join(",");
/** Fichier d'origine, avant réduction dans le navigateur : au-delà, une photo de téléphone n'a aucune raison d'exister */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/** Même plafond que le serveur (image-clean.ts) : pas de bombe d'image décodée dans l'onglet */
export const MAX_IMAGE_PIXELS = 50_000_000;
export const MAX_ZOOM = 4;

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} Mo`;

/** Avant toute lecture : type et poids. */
export function checkImageFile(file: { type: string; size: number }): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return "Format non pris en charge : choisis une image JPEG, PNG, WebP ou GIF.";
  if (file.size > MAX_IMAGE_BYTES) return `Image trop lourde (${mb(file.size)}) : ${mb(MAX_IMAGE_BYTES)} au plus.`;
  if (file.size === 0) return "Ce fichier est vide.";
  return null;
}

/** Une fois les dimensions connues (lecture locale) : assez grande, pas démesurée. */
export function checkImageSize(width: number, height: number, kind: ImageKind): string | null {
  const rule = IMAGE_RULES[kind];
  if (width * height > MAX_IMAGE_PIXELS) return "Image trop grande (plus de 50 millions de pixels).";
  if (width < rule.minWidth || height < rule.minHeight) return `Image trop petite (${width} × ${height}) : ${rule.minWidth} × ${rule.minHeight} pixels au moins.`;
  return null;
}

/** Le ratio diffère de plus de 1 % : on propose le recadrage. */
export const needsCrop = (width: number, height: number, kind: ImageKind) => Math.abs(width / height - IMAGE_RULES[kind].ratio) / IMAGE_RULES[kind].ratio > 0.01;

/** État du recadrage : le centre visé, en pixels de l'image, et le zoom (1 = le plus grand cadre qui tient dans l'image). */
export type Crop = { cx: number; cy: number; zoom: number };
export type Rect = { x: number; y: number; width: number; height: number };

/** Cadre au zoom 1 : le plus grand rectangle au bon ratio qui tient dans l'image. */
function fullFrame(width: number, height: number, ratio: number) {
  const w = Math.min(width, height * ratio);
  return { w, h: w / ratio };
}

/** Zoom maximal : ×4, sans descendre sous la taille minimale (l'image envoyée resterait floue). */
export function maxZoom(width: number, height: number, kind: ImageKind) {
  const rule = IMAGE_RULES[kind];
  const { w } = fullFrame(width, height, rule.ratio);
  return Math.max(1, Math.min(MAX_ZOOM, w / rule.minWidth));
}

export const initialCrop = (width: number, height: number): Crop => ({ cx: width / 2, cy: height / 2, zoom: 1 });

/** Zoom borné, centre ramené pour que le cadre reste dans l'image. */
export function clampCrop(crop: Crop, width: number, height: number, kind: ImageKind): Crop {
  const ratio = IMAGE_RULES[kind].ratio;
  const zoom = Math.min(Math.max(Number.isFinite(crop.zoom) ? crop.zoom : 1, 1), maxZoom(width, height, kind));
  const full = fullFrame(width, height, ratio);
  const w = full.w / zoom, h = full.h / zoom;
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(Number.isFinite(v) ? v : (lo + hi) / 2, lo), hi);
  return { zoom, cx: clamp(crop.cx, w / 2, width - w / 2), cy: clamp(crop.cy, h / 2, height - h / 2) };
}

/** Rectangle à découper dans l'image, en pixels de l'image. */
export function cropRect(crop: Crop, width: number, height: number, kind: ImageKind): Rect {
  const c = clampCrop(crop, width, height, kind);
  const full = fullFrame(width, height, IMAGE_RULES[kind].ratio);
  const w = full.w / c.zoom, h = full.h / c.zoom;
  return { x: c.cx - w / 2, y: c.cy - h / 2, width: w, height: h };
}

/** Déplacement à l'écran (glisser, flèches) : `dx` pixels d'écran pour un cadre affiché sur `viewWidth` pixels. L'image suit le doigt. */
export function panCrop(crop: Crop, dx: number, dy: number, viewWidth: number, width: number, height: number, kind: ImageKind): Crop {
  const scale = cropRect(crop, width, height, kind).width / viewWidth;
  return clampCrop({ ...crop, cx: crop.cx - dx * scale, cy: crop.cy - dy * scale }, width, height, kind);
}

/** Zoom vers un niveau, en gardant le centre (bouton, curseur, molette, pincement). */
export const zoomCrop = (crop: Crop, zoom: number, width: number, height: number, kind: ImageKind): Crop => clampCrop({ ...crop, zoom }, width, height, kind);

/** Taille de l'image envoyée : celle de la règle, jamais plus grande que le recadrage (pas d'agrandissement). */
export function outputSize(rect: Rect, kind: ImageKind) {
  const rule = IMAGE_RULES[kind];
  const scale = Math.min(1, rule.outWidth / rect.width);
  return { width: Math.max(1, Math.round(rect.width * scale)), height: Math.max(1, Math.round(rect.height * scale)) };
}
