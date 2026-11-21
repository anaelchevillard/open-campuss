import { describe, expect, it } from "vitest";
import { CARDS_GOAL, checklistProgress, checklistSteps, type ChecklistFacts } from "@/lib/checklist";

const none: ChecklistFacts = { opened: false, highlighted: false, cards: 0, friends: 0, shared: false };

describe("Bien démarrer", () => {
  it("cinq étapes, rien de fait au départ", () => {
    const steps = checklistSteps(none);
    expect(steps.map((s) => s.id)).toEqual(["open", "highlight", "cards", "friend", "share"]);
    expect(checklistProgress(steps)).toEqual({ done: 0, total: 5, complete: false });
  });

  it("se coche par l'usage réel", () => {
    const steps = checklistSteps({ ...none, opened: true, highlighted: true, cards: CARDS_GOAL - 1 });
    expect(steps.filter((s) => s.done).map((s) => s.id)).toEqual(["open", "highlight"]);
    expect(checklistSteps({ ...none, cards: CARDS_GOAL }).find((s) => s.id === "cards")?.done).toBe(true);
  });

  it("complète quand tout est fait", () => {
    const steps = checklistSteps({ opened: true, highlighted: true, cards: 12, friends: 2, shared: true });
    expect(checklistProgress(steps).complete).toBe(true);
  });

  it("l'ordre suit l'intention", () => {
    expect(checklistSteps(none, "exam")[0].id).toBe("cards");
    expect(checklistSteps(none, "share")[0].id).toBe("share");
    expect(checklistSteps(none, "read")[0].id).toBe("open");
  });

  it("le surlignage mène au dernier cours lu", () => {
    expect(checklistSteps({ ...none, lastDocId: "abc" }).find((s) => s.id === "highlight")?.href).toBe("/d/abc");
    expect(checklistSteps(none).find((s) => s.id === "highlight")?.href).toBe("/matieres");
  });
});
