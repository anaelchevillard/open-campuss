"use client";

/** Ce qui mérite des confettis (DESIGN.md §8.2). */
export type Celebration = "goal" | "quiz" | "streak" | "badge";

const KEY = "campuss-celebrate";
const today = () => new Date().toISOString().slice(0, 10);

function reducedMotion() {
  return document.documentElement.classList.contains("reduce-motion") || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Une seule célébration par jour et par compte, jamais bloquante, rien en mouvement réduit.
 * Renvoie vrai si les confettis sont partis.
 */
export async function celebrate(kind: Celebration, account = "visiteur"): Promise<boolean> {
  if (typeof window === "undefined" || reducedMotion()) return false;
  const key = `${KEY}:${account}`;
  try {
    if (localStorage.getItem(key) === today()) return false;
    localStorage.setItem(key, today());
  } catch {
    return false;
  }
  const { default: confetti } = await import("canvas-confetti");
  const colors = kind === "badge" ? ["#a10e2f", "#e2627f", "#fbbf24"] : ["#a10e2f", "#2563eb", "#15803d", "#fbbf24"];
  await confetti({ particleCount: 90, spread: 70, startVelocity: 38, ticks: 140, origin: { y: 0.7 }, colors, disableForReducedMotion: true, zIndex: 60 });
  return true;
}
