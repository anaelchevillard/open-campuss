import { describe, expect, it } from "vitest";
import { nextSpeed, pickFrenchVoice, podcastChunks } from "@/lib/podcast";

describe("écoute d'un cours", () => {
  it("découpe les blocs en morceaux courts sans perdre de texte", () => {
    const long = "Une phrase assez longue pour dépasser la limite. ".repeat(10);
    const chunks = podcastChunks(["Titre", "", long], 120);
    expect(chunks[0]).toEqual({ text: "Titre", block: 0 });
    expect(chunks.slice(1).every((c) => c.block === 2 && c.text.length <= 120)).toBe(true);
    expect(chunks.slice(1).map((c) => c.text).join(" ").replace(/\s+/g, " ")).toBe(long.trim());
  });

  it("coupe entre deux mots une phrase sans ponctuation", () => {
    const chunks = podcastChunks(["mot ".repeat(100)], 50);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((c) => c.text.length <= 50 && !c.text.includes("  "))).toBe(true);
  });

  it("choisit une voix française et fait tourner les vitesses", () => {
    const voice = pickFrenchVoice([{ lang: "en-US", name: "A" }, { lang: "fr-CA", name: "B" }, { lang: "fr-FR", name: "C" }]);
    expect(voice?.name).toBe("C");
    expect(pickFrenchVoice([{ lang: "en-US", name: "A" }])).toBeUndefined();
    expect(nextSpeed(1)).toBe(1.25);
    expect(nextSpeed(2)).toBe(0.75);
  });
});
