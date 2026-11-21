import { describe, expect, it } from "vitest";
import { AI_TIERS, aiAllowance, aiRefusal, nextAiTier, quotaDay, quotaKey } from "../src/lib/ai-quota";

describe("quota d'IA", () => {
  it("base gratuite pour tous", () => {
    expect(aiAllowance(0)).toEqual({ pages: 5, memo: 3, suggest: 10 });
  });

  it("grandit avec les crédits, jusqu'à un plafond", () => {
    expect(aiAllowance(29).pages).toBe(5);
    expect(aiAllowance(30).pages).toBe(10);
    expect(aiAllowance(100_000)).toEqual(aiAllowance(480));
    for (const [index, tier] of AI_TIERS.entries()) {
      if (!index) continue;
      expect(tier.pages).toBeGreaterThan(AI_TIERS[index - 1].pages);
      expect(tier.memo).toBeGreaterThan(AI_TIERS[index - 1].memo);
    }
  });

  it("des crédits négatifs ou absents restent à la base", () => {
    expect(aiAllowance(-5).pages).toBe(5);
    expect(nextAiTier(-5)?.at).toBe(30);
    expect(nextAiTier(480)).toBeNull();
  });

  it("le jour suit Paris : le compteur repart à minuit, pas à minuit UTC", () => {
    expect(quotaDay(new Date("2026-11-02T22:59:00Z"))).toBe("2026-11-02");
    expect(quotaDay(new Date("2026-11-02T23:01:00Z"))).toBe("2026-11-03");
    expect(quotaDay(new Date("2026-07-01T22:01:00Z"))).toBe("2026-07-02");
  });

  it("le compteur est propre au compte, à l'usage et au jour", () => {
    const at = new Date("2026-11-02T12:00:00Z");
    expect(quotaKey("pages", "a", at)).not.toBe(quotaKey("pages", "b", at));
    expect(quotaKey("pages", "a", at)).not.toBe(quotaKey("memo", "a", at));
    expect(quotaKey("pages", "a", at)).not.toBe(quotaKey("pages", "a", new Date("2026-11-03T12:00:00Z")));
  });

  it("le refus dit ce qui reste possible, en une phrase", () => {
    const message = aiRefusal("pages", 5, 0, 30);
    expect(message).toContain("minuit");
    expect(message).toContain("à 30 crédits");
    expect(message).toContain("10 pages à transcrire");
    expect(message.match(/\./g)).toHaveLength(1);
    expect(aiRefusal("memo", 20, 480, 30)).not.toContain("crédits");
  });
});
