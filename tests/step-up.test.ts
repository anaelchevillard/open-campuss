import { describe, expect, it } from "vitest";
import { isStepUpFresh, isStepUpRequired, STEP_UP_WINDOW_MS } from "@/lib/step-up";

const NOW = Date.UTC(2026, 10, 2, 12);

describe("preuve fraîche de double authentification", () => {
  it("manque sans date", () => {
    expect(isStepUpFresh(null, NOW)).toBe(false);
    expect(isStepUpFresh(undefined, NOW)).toBe(false);
  });

  it("vaut dix minutes, pas une de plus", () => {
    expect(STEP_UP_WINDOW_MS).toBe(600_000);
    expect(isStepUpFresh(new Date(NOW), NOW)).toBe(true);
    expect(isStepUpFresh(new Date(NOW - STEP_UP_WINDOW_MS + 1), NOW)).toBe(true);
    expect(isStepUpFresh(new Date(NOW - STEP_UP_WINDOW_MS), NOW)).toBe(false);
  });

  it("refuse une date à venir", () => {
    expect(isStepUpFresh(new Date(NOW + 1000), NOW)).toBe(false);
  });

  it("reconnaît la réponse d'une action refusée, et elle seule", () => {
    expect(isStepUpRequired({ stepUp: { totp: true, passkey: false } })).toBe(true);
    for (const other of [undefined, null, "stepUp", { ok: "fait" }, { error: "non" }]) expect(isStepUpRequired(other)).toBe(false);
  });
});
