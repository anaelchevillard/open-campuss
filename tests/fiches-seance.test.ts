import { describe, expect, it } from "vitest";
import { cardImageAllowed, hasMarkup, withHardBreaks } from "../src/lib/card-text";
import { formatInterval, nextReview, previewDelays, previewIntervals, recallProbability, restoreSnapshot, snapshotOf, spokenInterval, type StoredCard } from "../src/lib/fsrs";
import { HEAT_MAX_WEEKS, HEAT_MIN_WEEKS, heatDays, heatWeeks } from "../src/lib/heat-grid";
import { FREE_SCOPE, parseScope } from "../src/lib/memo-pack-rules";
import { cardStatus, deckSummary, mastery, matchesFilter, memoryStats, type StatCard } from "../src/lib/memo-stats";
import { remainingCounts, sessionKeyAction } from "../src/lib/session-keys";
import { shiftDay } from "../src/lib/study-habits";

const now = new Date("2026-11-14T10:00:00Z");
const DAY = 86_400_000;
const fresh: StoredCard = { dueAt: now, intervalDays: 0, ease: 250, reps: 0, lastReviewedAt: null, stability: 0, difficulty: 0, state: 0, lapses: 0, learningSteps: 0 };

describe("Régularité : la grille remplit la largeur", () => {
  it("plus de semaines quand le panneau est plus large, entre 10 et 53", () => {
    expect(heatWeeks(500)).toBeLessThan(heatWeeks(1000));
    expect(heatWeeks(120)).toBe(HEAT_MIN_WEEKS);
    expect(heatWeeks(5000)).toBe(HEAT_MAX_WEEKS);
    expect(heatWeeks(0)).toBe(18);
  });

  it("les cases gardent une taille lisible, proche de 15 px", () => {
    for (const width of [400, 640, 800, 1024]) {
      const weeks = heatWeeks(width);
      const cell = (width / (weeks * 15 - 3)) * 12;
      expect(cell).toBeGreaterThan(12);
      expect(cell).toBeLessThan(20);
    }
  });

  it("les jours vont jusqu'à aujourd'hui, lundi en haut de la première colonne", () => {
    const days = heatDays("2026-11-14", 20, shiftDay);
    expect(days.at(-1)).toBe("2026-11-14");
    expect(new Date(`${days[0]}T12:00:00Z`).getUTCDay()).toBe(1);
    expect(days.length).toBe(19 * 7 + 6);
  });
});

describe("FSRS : intervalles sous les boutons et annulation", () => {
  it("quatre intervalles croissants, du raté au facile", () => {
    const delays = previewDelays(null, now);
    expect(delays).toHaveLength(4);
    expect(delays[0]).toBeLessThan(delays[2]);
    expect(delays[2]).toBeLessThanOrEqual(delays[3]);
    expect(previewIntervals(null, now)[0]).toMatch(/min/);
  });

  it("l'aperçu correspond à la note réellement enregistrée", () => {
    const card: StoredCard = { ...fresh, ...nextReview(fresh, 2, now) };
    const later = new Date(card.dueAt.getTime() + DAY);
    const delays = previewDelays(card, later);
    expect(nextReview(card, 3, later).dueAt.getTime() - later.getTime()).toBe(delays[3]);
  });

  it("écrit les intervalles en français court, et en toutes lettres pour les lecteurs d'écran", () => {
    expect(formatInterval(20_000)).toBe("< 1 min");
    expect(formatInterval(10 * 60_000)).toBe("10 min");
    expect(formatInterval(3 * 3_600_000)).toBe("3 h");
    expect(formatInterval(2 * DAY)).toBe("2 j");
    expect(formatInterval(21 * DAY)).toBe("3 sem.");
    expect(formatInterval(120 * DAY)).toBe("4 mois");
    expect(formatInterval(365 * DAY)).toBe("1 an");
    expect(spokenInterval(2 * DAY)).toBe("2 jours");
    expect(spokenInterval(21 * DAY)).toBe("3 semaines");
  });

  it("l'état sauvegardé avant une note se remet à l'identique", () => {
    const card: StoredCard = { ...fresh, ...nextReview(fresh, 2, now) };
    const snapshot = JSON.parse(JSON.stringify(snapshotOf(card)));
    const graded = { ...card, ...nextReview(card, 0, new Date(now.getTime() + 3 * DAY)) };
    expect(graded.lapses).toBeGreaterThanOrEqual(card.lapses);
    const restored = restoreSnapshot(snapshot);
    expect(restored.dueAt.getTime()).toBe(card.dueAt.getTime());
    expect(restored.stability).toBe(card.stability);
    expect(restored.state).toBe(card.state);
    expect(restored.lastReviewedAt?.getTime()).toBe(now.getTime());
  });

  it("probabilité de rappel : inconnue pour une nouvelle, baisse avec le temps", () => {
    expect(recallProbability(fresh, now)).toBeNull();
    const card: StoredCard = { ...fresh, ...nextReview(fresh, 2, now) };
    const soon = recallProbability(card, new Date(now.getTime() + DAY))!;
    const late = recallProbability(card, new Date(now.getTime() + 30 * DAY))!;
    expect(soon).toBeGreaterThan(late);
  });
});

describe("Statistiques de mémoire", () => {
  const card = (over: Partial<StatCard>): StatCard => ({ dueAt: now, state: 2, intervalDays: 5, suspendedAt: null, lastReviewedAt: now, ...over });
  const cards = [
    card({ state: 0, lastReviewedAt: null }),
    card({ state: 1, intervalDays: 0 }),
    card({ intervalDays: 30, dueAt: new Date(now.getTime() + 2 * DAY) }),
    card({ intervalDays: 3, dueAt: new Date(now.getTime() - DAY) }),
    card({ suspendedAt: now, dueAt: new Date(now.getTime() - DAY) }),
  ];

  it("classe les fiches : nouvelle, apprentissage, jeune, acquise, de côté", () => {
    expect(cards.map(cardStatus)).toEqual(["new", "learning", "mature", "young", "suspended"]);
  });

  it("compte les fiches à revoir sans les nouvelles ni celles de côté, et prévoit la semaine", () => {
    const stats = memoryStats(cards, [0, 2, 3, 2], now);
    expect(stats.due).toBe(2);
    expect(stats.fresh).toBe(1);
    expect(stats.suspended).toBe(1);
    expect(stats.retention).toBe(75);
    expect(stats.forecast).toHaveLength(7);
    expect(stats.forecast[0]).toBe(2);
    expect(stats.forecast.reduce((a, b) => a + b, 0)).toBe(3);
    expect(memoryStats([], [], now).retention).toBeNull();
  });

  it("maîtrise et résumé d'un paquet", () => {
    const stats = memoryStats(cards, [], now);
    expect(mastery(stats)).toBe(25);
    expect(deckSummary(stats)).toBe("2 à revoir · 1 nouvelle · 5 fiches");
    expect(deckSummary({ total: 1, due: 0, fresh: 0 })).toBe("1 fiche");
  });

  it("filtres de la liste", () => {
    expect(cards.filter((c) => matchesFilter(c, "due", now))).toHaveLength(2);
    expect(cards.filter((c) => matchesFilter(c, "suspended", now))).toHaveLength(1);
    expect(cards.filter((c) => matchesFilter(c, "all", now))).toHaveLength(5);
  });
});

describe("Raccourcis de séance", () => {
  it("Espace retourne, puis note Bien ; 1 à 4 seulement réponse vue", () => {
    expect(sessionKeyAction({ key: " " }, false)).toEqual({ type: "flip" });
    expect(sessionKeyAction({ key: "3" }, false)).toBeNull();
    expect(sessionKeyAction({ key: " " }, true)).toEqual({ type: "grade", grade: 2 });
    expect(sessionKeyAction({ key: "1" }, true)).toEqual({ type: "grade", grade: 0 });
    expect(sessionKeyAction({ key: "4" }, true)).toEqual({ type: "grade", grade: 3 });
    expect(sessionKeyAction({ key: "5" }, true)).toBeNull();
  });

  it("annuler, modifier, mettre de côté, aide ; Ctrl+Z annule mais Ctrl+E ne fait rien", () => {
    expect(sessionKeyAction({ key: "z" }, false)).toEqual({ type: "undo" });
    expect(sessionKeyAction({ key: "z", ctrlKey: true }, true)).toEqual({ type: "undo" });
    expect(sessionKeyAction({ key: "e", ctrlKey: true }, true)).toBeNull();
    expect(sessionKeyAction({ key: "e" }, true)).toEqual({ type: "edit" });
    expect(sessionKeyAction({ key: "m" }, false)).toEqual({ type: "suspend" });
    expect(sessionKeyAction({ key: "?" }, false)).toEqual({ type: "help" });
  });

  it("ce qui reste : à revoir, nouvelles, questions", () => {
    expect(remainingCounts([{ kind: "card" }, { kind: "card", fresh: true }, { kind: "new" }, { kind: "question" }])).toEqual({ due: 1, fresh: 2, questions: 1 });
  });
});

describe("Texte des fiches", () => {
  it("images du site seulement, jamais d'adresse externe", () => {
    expect(cardImageAllowed("/files/0b9f3c8e-1d2a-4c55-9a77-1234567890ab")).toBe(true);
    expect(cardImageAllowed("https://exemple.fr/pixel.png")).toBe(false);
    expect(cardImageAllowed("//exemple.fr/x.png")).toBe(false);
    expect(cardImageAllowed("/files/../admin")).toBe(false);
    expect(cardImageAllowed(undefined)).toBe(false);
  });

  it("le texte brut ne passe pas par le moteur Markdown ; formules et gras oui", () => {
    expect(hasMarkup("La sensibilité de la demande au prix.")).toBe(false);
    expect(hasMarkup("Coût : 10 euros")).toBe(false);
    expect(hasMarkup("$$E = mc^2$$")).toBe(true);
    expect(hasMarkup("Un **mot** important")).toBe(true);
    expect(hasMarkup("- premier\n- second")).toBe(true);
  });

  it("un retour à la ligne reste un retour à la ligne, un paragraphe reste un paragraphe", () => {
    expect(withHardBreaks("a\nb")).toBe("a  \nb");
    expect(withHardBreaks("a\n\nb")).toBe("a\n\nb");
    expect(withHardBreaks("a\r\nb")).toBe("a  \nb");
  });
});

describe("Portée d'un paquet lue dans l'URL", () => {
  it("« libre » ou un identifiant de cours, rien d'autre", () => {
    expect(parseScope(FREE_SCOPE)).toBe(FREE_SCOPE);
    expect(parseScope("0B9F3C8E-1D2A-4C55-9A77-1234567890AB")).toBe("0b9f3c8e-1d2a-4c55-9a77-1234567890ab");
    expect(parseScope("x' or 1=1")).toBeNull();
    expect(parseScope(["libre"])).toBeNull();
    expect(parseScope(undefined)).toBeNull();
  });
});
