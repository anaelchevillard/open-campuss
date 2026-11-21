"use client";

/**
 * Sons et vibrations de révision : coupés par défaut (préférences `sounds` et `haptics`).
 * Trois sons courts synthétisés sur place (Web Audio) : aucun fichier, aucun service.
 */
export type Cue = "good" | "bad" | "done";

const NOTES: Record<Cue, [number, number][]> = {
  good: [[660, 0], [880, 0.07]],
  bad: [[220, 0]],
  done: [[523, 0], [659, 0.09], [784, 0.18]],
};

let context: AudioContext | null = null;

export function cue(kind: Cue, prefs: { sounds?: boolean; haptics?: boolean }) {
  if (prefs.haptics && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(kind === "bad" ? [10, 40, 10] : 10);
  if (!prefs.sounds || typeof window === "undefined") return;
  try {
    context ??= new AudioContext();
    const now = context.currentTime;
    for (const [frequency, at] of NOTES[kind]) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.08, now + at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.16);
      osc.connect(gain).connect(context.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.18);
    }
  } catch {
    // Pas de son disponible : la révision continue sans
  }
}
