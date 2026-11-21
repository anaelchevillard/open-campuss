import { describe, expect, it } from "vitest";
import { badgeBoard, badgeOf, badgeRowIds, BADGES, isEarned, RARITIES, type Stats } from "@/lib/badges";

const stats = (patch: Partial<Stats> = {}): Stats => ({
  byCategory: {}, published: 0, subjects: 0, thanksReceived: 0, thanksGiven: 0, revised: 0, reportsAccepted: 0, profileComplete: false, pioneer: false, credits: 0,
  bestStreak: 0, cardsReviewed: 0, friends: 0, bigGroup: false, duelsWon: 0, mockBest: 0, sharedAnnotations: 0, corrections: 0, ...patch,
});

describe("badges", () => {
  it("identifiants uniques, alias compris", () => {
    const ids = BADGES.flatMap((b) => [b.id, ...(b.aliases ?? [])]);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("les anciens identifiants restent des alias, et un retrait vise l'identifiant et ses alias", () => {
    expect(badgeOf("plume-d-or")?.id).toBe("scribe-3");
    expect(badgeOf("premier-cours")?.name).toBe("Scribe I");
    expect(badgeRowIds("scribe-2")).toEqual(["scribe-2", "scribe"]);
    expect(badgeRowIds("scribe")).toEqual(["scribe-2", "scribe"]);
  });
  it("paliers Scribe I, II, III à 1, 5 et 15 cours", () => {
    const s = stats({ published: 5, byCategory: { cours: 5 } });
    expect(isEarned(badgeOf("scribe-1")!, s) && isEarned(badgeOf("scribe-2")!, s)).toBe(true);
    expect(isEarned(badgeOf("scribe-3")!, s)).toBe(false);
  });
  it("obtenus d'abord par rareté puis date, verrouillés ensuite par progression", () => {
    const old = new Date("2026-01-01"), recent = new Date("2026-10-01");
    const board = badgeBoard([{ badge: "premier-cours", earnedAt: recent }, { badge: "pionnier", earnedAt: old }, { badge: "merci-1", earnedAt: old }], stats({ published: 4, byCategory: { cours: 4 }, thanksReceived: 1 }));
    expect(board.slice(0, 3).map((v) => v.badge.id)).toEqual(["pionnier", "scribe-1", "merci-1"]);
    expect(board[3].badge.id).toBe("scribe-2"); // 4 sur 5 : le plus proche
    const locked = board.filter((v) => !v.earnedAt);
    for (let i = 1; i < locked.length; i++) expect(locked[i - 1].value / locked[i - 1].target).toBeGreaterThanOrEqual(locked[i].value / locked[i].target);
  });
  it("chaque rareté a sa forme et son mot ; un badge manuel est « Spécial »", () => {
    expect(new Set(Object.values(RARITIES).map((r) => r.label)).size).toBe(5);
    const [first] = badgeBoard([{ badge: "bonne-ame", earnedAt: new Date(), grantedBy: "x" }], null);
    expect(first.manual).toBe(true);
  });
});
