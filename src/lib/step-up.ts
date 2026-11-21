/** Durée pendant laquelle un second facteur redonné en session vaut pour les actions d'administration sensibles. */
export const STEP_UP_WINDOW_MS = 10 * 60_000;

/** Réponse d'une action refusée faute de preuve fraîche : une exception serait masquée par Next en production. */
export type StepUpRequired = { stepUp: StepUpMethods };
export type StepUpMethods = { totp: boolean; passkey: boolean };

export function isStepUpFresh(at: Date | null | undefined, now = Date.now(), windowMs = STEP_UP_WINDOW_MS) {
  if (!at) return false;
  const age = now - at.getTime();
  return age >= 0 && age < windowMs;
}

export function isStepUpRequired(value: unknown): value is StepUpRequired {
  return typeof value === "object" && value !== null && "stepUp" in value;
}
