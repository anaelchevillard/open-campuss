import { describe, expect, it } from "vitest";
import { cleanNameStyle, cleanStatus, contrast, hexToRgb, NAME_DARK, NAME_GRADIENTS, NAME_HUES, NAME_LIGHT, nameProblem, oklchToSrgb, statusLive } from "@/lib/name-style";

const CARD_LIGHT = hexToRgb("#ffffff");
const CARD_DARK = hexToRgb("#1e1a1c");
const BG_DARK = hexToRgb("#151213");

describe("couleurs de nom", () => {
  it("aucune teinte entre 250 et 290 (réservées à l'IA)", () => {
    for (const hue of NAME_HUES) expect(hue.h < 250 || hue.h > 290).toBe(true);
  });
  it("chaque teinte passe 4,5:1 sur la carte, en clair et en sombre", () => {
    for (const { h } of NAME_HUES) {
      expect(contrast(oklchToSrgb(NAME_LIGHT.l, NAME_LIGHT.c, h), CARD_LIGHT)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(oklchToSrgb(NAME_DARK.l, NAME_DARK.c, h), CARD_DARK)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(oklchToSrgb(NAME_DARK.l, NAME_DARK.c, h), BG_DARK)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("les deux extrémités de chaque dégradé passent le test, et viennent de la liste", () => {
    const hues = new Set(NAME_HUES.map((h) => h.h));
    for (const g of NAME_GRADIENTS) {
      for (const h of [g.from, g.to]) {
        expect(hues.has(h)).toBe(true);
        expect(contrast(oklchToSrgb(NAME_LIGHT.l, NAME_LIGHT.c, h), CARD_LIGHT)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(oklchToSrgb(NAME_DARK.l, NAME_DARK.c, h), CARD_DARK)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it("pas d'hexadécimal libre : seules les valeurs de la liste passent", () => {
    expect(cleanNameStyle({ hue: 270, font: "comic", gradient: "arc-en-ciel", effect: "clignote" })).toEqual({});
    expect(cleanNameStyle({ hue: 135, font: "caveat", gradient: "foret", effect: "reflet" })).toEqual({ hue: 135, font: "caveat", gradient: "foret", effect: "reflet" });
    expect(cleanNameStyle({ hue: "#ff0000" })).toEqual({});
  });
});

describe("filtre des noms", () => {
  it("accepte les noms ordinaires, accents compris", () => {
    for (const name of ["Léa Martin", "Zoé D’Aubigné", "Ngozi Okonkwo-Øster", "José María"]) expect(nameProblem(name)).toBeNull();
  });
  it("refuse les lettres mathématiques Unicode", () => {
    expect(nameProblem("𝓝𝓸𝓶 𝓒𝓸𝓾𝓻𝓪𝓷𝓽")).not.toBeNull();
    expect(nameProblem("𝐋𝐞𝐚")).not.toBeNull();
    expect(nameProblem("Ｌéａ")).not.toBeNull();
  });
  it("refuse les caractères invisibles et les empilements de diacritiques", () => {
    expect(nameProblem("Lé​a")).not.toBeNull();
    expect(nameProblem("L‮éa")).not.toBeNull();
    expect(nameProblem("Z̶̵̴̷alg̀́̂o")).not.toBeNull();
  });
});

describe("statut", () => {
  it("garde un emoji et 60 caractères, et expire", () => {
    const status = cleanStatus({ emoji: "📚x", text: "a".repeat(80), expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(status?.emoji).toBe("📚");
    expect(status?.text.length).toBe(60);
    expect(statusLive(status)).toBe(false);
    expect(cleanStatus({ text: "  " })).toBeNull();
  });
});
