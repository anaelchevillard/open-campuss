import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Contrastes de la charte (DESIGN.md §2.2 à §2.6), relus dans les fichiers CSS : un token modifié sans vérification casse ce test
const tokens = readFileSync("src/styles/tokens.css", "utf8");
const ai = readFileSync("src/styles/ai.css", "utf8");

function block(css: string, selector: string) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`bloc introuvable : ${selector}`);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(css.indexOf("{", start) + 1, i);
  }
  throw new Error(`bloc non fermé : ${selector}`);
}
function vars(body: string) {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{3,8})\b/gi)) out[m[1]] = m[2].toLowerCase();
  return out;
}
const light = vars(block(tokens, ":root"));
const dark = { ...light, ...vars(block(tokens, ":root.dark")) };

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [number, number, number];
}
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]: [number, number, number]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
function ratio(a: [number, number, number], b: [number, number, number]) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const contrast = (a: string, b: string) => ratio(rgb(a), rgb(b));

// OKLCH → sRGB (Björn Ottosson), écrêté au gamut comme le fait le navigateur à peu près
function oklch(l: number, c: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h), b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const toSrgb = (x: number) => { const v = Math.min(1, Math.max(0, x)); return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; };
  return [
    toSrgb(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    toSrgb(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    toSrgb(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ];
}

const TEXT_PAIRS: [string, string][] = [
  ["foreground", "background"], ["foreground", "card"], ["foreground", "popover"], ["foreground", "dialog"], ["foreground", "muted"],
  ["muted-foreground", "background"], ["muted-foreground", "card"], ["muted-foreground", "popover"],
  ["primary-foreground", "primary"], ["primary-foreground", "primary-hover"],
  ["brand-text", "brand-tint"], ["brand-text", "background"], ["brand-text", "card"],
  ["link", "background"], ["link", "card"],
  ["sidebar-foreground", "sidebar"], ["sidebar-foreground", "sidebar-accent"],
  ["success-foreground", "success-tint"], ["warning-foreground", "warning-tint"], ["destructive-foreground", "destructive-tint"], ["info-foreground", "info-tint"],
  ["highlighter-ink", "highlighter"], ["invert-foreground", "invert"],
];

describe("contrastes des tokens", () => {
  for (const [theme, t] of [["clair", light], ["sombre", dark]] as const) {
    for (const [fg, bg] of TEXT_PAIRS) {
      it(`${theme} : ${fg} sur ${bg} ≥ 4,5:1`, () => {
        expect(t[fg], fg).toBeDefined();
        expect(t[bg], bg).toBeDefined();
        expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
    it(`${theme} : bordure de champ ≥ 3:1 sur le fond et sur une carte`, () => {
      expect(contrast(t.input, t.background)).toBeGreaterThanOrEqual(3);
      expect(contrast(t.input, t.card)).toBeGreaterThanOrEqual(3);
    });
  }
  it("clair : texte blanc sur les états pleins et le bouton de confirmation destructive", () => {
    for (const k of ["success", "warning", "destructive", "info", "danger-solid"]) expect(contrast("#ffffff", light[k]), k).toBeGreaterThanOrEqual(4.5);
  });
  it("sombre : les états servent de texte sur une carte", () => {
    for (const k of ["success", "warning", "destructive", "info"]) expect(contrast(dark[k], dark.card), k).toBeGreaterThanOrEqual(4.5);
  });
  it("le danger reste distinct du bordeaux", () => {
    expect(light["danger-solid"]).not.toBe(light.primary);
    expect(light.destructive).not.toBe(light.primary);
  });
});

describe("couleurs de nom (OKLCH imposé par le thème)", () => {
  const HUES = [0, 20, 45, 70, 100, 135, 160, 185, 210, 230, 320, 350];
  for (const h of HUES) {
    it(`teinte ${h}°`, () => {
      expect(h < 250 || h > 290).toBe(true);
      expect(ratio(oklch(0.48, 0.16, h), rgb(light.card))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(oklch(0.8, 0.12, h), rgb(dark.card))).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("Campuss IA", () => {
  const aiLight = vars(block(ai, ":root"));
  const aiDark = vars(block(ai, ":root.dark"));
  for (const k of ["ai-1", "ai-2", "ai-3", "ai-4"]) {
    it(`${k} lisible en texte dans les deux thèmes`, () => {
      expect(contrast(aiLight[k], light.card)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(aiDark[k], dark.card)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
