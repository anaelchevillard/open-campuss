import { describe, expect, it } from "vitest";
import { badgeOf, isEarned, type Stats } from "@/lib/badges";
import { correctionPoints, PENDING_PROPOSALS_PER_DOC, POINTS_PER_CORRECTION, PROPOSALS_PER_DAY, PROPOSALS_PER_HOUR } from "@/lib/contribution-rules";
import { frameUnlock, unlocks, type UnlockContext } from "@/lib/unlocks";

const ctx = (patch: Partial<UnlockContext> = {}): UnlockContext => ({ credits: 0, published: 0, badges: new Set(), bestStreak: 0, moderator: false, seasonTrophies: 0, grants: new Set(), bannerImages: true, ...patch });
const stats = (corrections: number) => ({ byCategory: {}, published: 0, subjects: 0, thanksReceived: 0, thanksGiven: 0, revised: 0, reportsAccepted: 0, profileComplete: false, pioneer: false, credits: 0,
  bestStreak: 0, cardsReviewed: 0, friends: 0, bigGroup: false, duelsWon: 0, mockBest: 0, sharedAnnotations: 0, corrections }) satisfies Stats;

describe("contribution par propositions de modification", () => {
  it("une correction acceptée rapporte moins qu'un cours publié (30)", () => {
    expect(POINTS_PER_CORRECTION).toBeGreaterThan(0);
    expect(POINTS_PER_CORRECTION).toBeLessThan(30);
    expect(correctionPoints(3)).toBe(3 * POINTS_PER_CORRECTION);
    expect(correctionPoints(-2)).toBe(0);
  });

  it("le débit des propositions est borné", () => {
    expect(PROPOSALS_PER_HOUR).toBeLessThanOrEqual(PROPOSALS_PER_DAY);
    expect(PENDING_PROPOSALS_PER_DOC).toBeGreaterThanOrEqual(1);
  });

  it("le trophée « Correcteur » a trois paliers : 1, 5 et 20 modifications", () => {
    const [one, five, twenty] = ["correcteur-1", "correcteur-2", "correcteur-3"].map((id) => badgeOf(id)!);
    expect(isEarned(one, stats(1)) && !isEarned(one, stats(0))).toBe(true);
    expect(isEarned(five, stats(5)) && !isEarned(five, stats(4))).toBe(true);
    expect(isEarned(twenty, stats(20)) && !isEarned(twenty, stats(19))).toBe(true);
  });

  it("les paliers ouvrent le cadre plume, puis la police et le dégradé du nom sans les crédits", () => {
    expect(frameUnlock("plume")).toBe("cadre-plume");
    expect(unlocks(ctx())["cadre-plume"].open).toBe(false);
    const state = unlocks(ctx({ badges: new Set(["correcteur-1", "correcteur-2", "correcteur-3"]) }));
    expect(state["cadre-plume"].open && state["police-nom"].open && state["degrade-nom"].open).toBe(true);
  });
});
