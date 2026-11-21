import { describe, expect, it } from "vitest";
import { fromSm2, nextReview, revisionPlan, toFsrsCard, type StoredCard } from "../src/lib/fsrs";

const now = new Date("2026-11-13T10:00:00Z");
const fresh: StoredCard = { dueAt: now, intervalDays: 0, ease: 250, reps: 0, lastReviewedAt: null, stability: 0, difficulty: 0, state: 0, lapses: 0, learningSteps: 0 };
const DAY = 86_400_000;

describe("FSRS", () => {
  it("une nouvelle fiche ratée revient dans quelques minutes, une fiche facile dans plusieurs jours", () => {
    const again = nextReview(fresh, 0, now);
    expect(again.dueAt.getTime() - now.getTime()).toBeLessThan(DAY);
    expect(again.state).toBe(1);
    const easy = nextReview(fresh, 3, now);
    expect(easy.intervalDays).toBeGreaterThanOrEqual(3);
    expect(easy.state).toBe(2);
  });

  it("les intervalles grandissent avec les bonnes réponses et retombent après un oubli", () => {
    let card: StoredCard = { ...fresh, ...nextReview(fresh, 2, now) };
    let at = now;
    const intervals: number[] = [];
    for (let i = 0; i < 4; i++) {
      at = card.dueAt;
      card = { ...card, ...nextReview(card, 2, at) };
      intervals.push(card.intervalDays);
    }
    expect(intervals[3]).toBeGreaterThan(intervals[0]);
    const lapsed = nextReview(card, 0, card.dueAt);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.intervalDays).toBeLessThan(card.intervalDays);
  });

  it("reprend un état SM-2 sans perdre l'échéance", () => {
    expect(fromSm2({ intervalDays: 0, ease: 250, reps: 0, lastReviewedAt: null }).state).toBe(0);
    expect(fromSm2({ intervalDays: 0, ease: 230, reps: 0, lastReviewedAt: now })).toMatchObject({ state: 3, stability: 1, difficulty: 6 });
    expect(fromSm2({ intervalDays: 20, ease: 330, reps: 4, lastReviewedAt: now })).toMatchObject({ state: 2, stability: 20, difficulty: 1 });
    const legacy: StoredCard = { ...fresh, intervalDays: 20, reps: 4, lastReviewedAt: new Date(now.getTime() - 20 * DAY), dueAt: now };
    expect(toFsrsCard(legacy)).toMatchObject({ state: 2, stability: 20, due: now });
    expect(nextReview(legacy, 2, now).intervalDays).toBeGreaterThan(20);
  });

  it("répartit le plan de révision en laissant le dernier jour libre", () => {
    expect(revisionPlan([1, 2, 3, 4], 3).map((d) => d.items)).toEqual([[1, 2], [3, 4]]);
  });
});
