import { describe, expect, it } from "vitest";
import {
  addDays, alignSeries, bucketSeries, compare, dayRange, filtersOf, formatSeconds, funnelView, missQuery, periodOf,
  retentionTable, statsHref, trendLabel, viewSeconds,
} from "@/lib/audience-calc";

describe("périodes", () => {
  it("compte aujourd'hui dans la période et met la précédente juste avant, de même longueur", () => {
    const p = periodOf("7", new Date("2026-11-14T10:00:00Z"));
    expect(p.current).toEqual({ from: "2026-11-08", to: "2026-11-14" });
    expect(p.previous).toEqual({ from: "2026-11-01", to: "2026-11-07" });
    expect(dayRange(p.current)).toHaveLength(7);
    expect(dayRange(p.previous)).toHaveLength(7);
  });

  it("revient à 30 jours pour une valeur inconnue", () => {
    expect(periodOf("12", new Date("2026-11-14T10:00:00Z")).days).toBe(30);
    expect(periodOf(undefined).days).toBe(30);
  });

  it("prend le jour de Paris, pas celui de Londres, juste avant minuit", () => {
    expect(periodOf("7", new Date("2026-11-14T23:30:00Z")).current.to).toBe("2026-11-15");
  });

  it("traverse les mois et les années", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
  });
});

describe("comparaison à la période précédente", () => {
  it("donne l'écart et la variation relative", () => {
    const c = compare(125, 100);
    expect(c).toMatchObject({ delta: 25, ratio: 0.25, trend: "up" });
    expect(trendLabel(c)).toBe("+25 %");
    expect(trendLabel(compare(97, 100))).toBe("−3 %");
  });

  it("dit « nouveau » quand il n'y avait rien avant, plutôt qu'un pourcentage infini", () => {
    expect(compare(4, 0)).toMatchObject({ ratio: null, trend: "new" });
    expect(trendLabel(compare(0, 0))).toBe("=");
  });

  it("ne compare pas une valeur absente", () => {
    expect(compare(null, 3).trend).toBeNull();
    expect(trendLabel(compare(3, null))).toBeNull();
  });

  it("aligne les deux périodes jour par jour, jours vides compris", () => {
    const p = periodOf("7", new Date("2026-11-14T10:00:00Z"));
    const s = alignSeries([{ day: "2026-11-08", n: 3 }, { day: "2026-11-01", n: 5 }, { day: "2026-11-14", n: 1 }], p);
    expect(s[0]).toEqual({ day: "2026-11-08", current: 3, previous: 5 });
    expect(s[3]).toEqual({ day: "2026-11-11", current: 0, previous: 0 });
    expect(s[6].current).toBe(1);
  });

  it("regroupe par semaine en partant de la fin, en sommant ou en gardant la dernière valeur", () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ day: `d${i}`, current: 1, previous: 2 }));
    const weeks = bucketSeries(points, 7);
    expect(weeks.map((w) => w.current)).toEqual([3, 7]);
    expect(weeks[1]).toEqual({ day: "d3", current: 7, previous: 14 });
    expect(bucketSeries(points, 7, "last")[1].current).toBe(1);
    // Moyenne : le premier paquet, incomplet, n'est pas divisé par 7
    expect(bucketSeries(points, 7, "mean").map((w) => w.current)).toEqual([1, 1]);
  });
});

describe("rétention par cohorte", () => {
  const rows = [
    { cohort: "2026-09-28", signed: 10, d1: 6, d7: 4, d30: 2 },
    { cohort: "2026-11-02", signed: 5, d1: 3, d7: 1, d30: 0 },
  ];

  it("calcule J+1, J+7 et J+30 par cohorte", () => {
    const { lines } = retentionTable(rows, "2026-11-14");
    expect(lines[0].cells.map((c) => c.rate)).toEqual([0.6, 0.4, 0.2]);
  });

  it("laisse vide une case que la cohorte n'a pas encore pu atteindre", () => {
    const { lines } = retentionTable(rows, "2026-11-14");
    // Dernier inscrit le 8 novembre : J+7 le 15, J+30 en décembre
    expect(lines[1].cells.map((c) => c.rate)).toEqual([0.6, null, null]);
  });

  it("fait la moyenne pondérée sur les seules cohortes mûres", () => {
    const { average } = retentionTable(rows, "2026-11-14");
    expect(average[0].rate).toBeCloseTo(9 / 15);
    expect(average[1].rate).toBeCloseTo(4 / 10);
    expect(retentionTable([], "2026-11-14").average.every((c) => c.rate === null)).toBe(true);
  });

  it("attend la fin du mois pour une cohorte mensuelle", () => {
    const { lines } = retentionTable([{ cohort: "2026-10-01", signed: 4, d1: 2, d7: 1, d30: 1 }], "2026-11-14", "month");
    expect(lines[0].cells.map((c) => c.rate)).toEqual([0.5, 0.25, null]);
  });

  it("ne divise jamais par une cohorte vide", () => {
    const { lines } = retentionTable([{ cohort: "2026-01-05", signed: 0, d1: 0, d7: 0, d30: 0 }], "2026-11-14");
    expect(lines[0].cells.every((c) => c.rate === null)).toBe(true);
  });
});

describe("entonnoir", () => {
  it("donne chaque étape en part du départ et de l'étape précédente, avec les perdus", () => {
    const view = funnelView([
      { id: "signed", label: "Inscription", n: 200 },
      { id: "read", label: "Premier cours lu", n: 120 },
      { id: "card", label: "Première fiche", n: 30 },
      { id: "published", label: "Publication", n: 3 },
    ]);
    expect(view[0]).toMatchObject({ ofFirst: 1, ofPrevious: null, lost: 0 });
    expect(view[1]).toMatchObject({ ofFirst: 0.6, ofPrevious: 0.6, lost: 80 });
    expect(view[2]).toMatchObject({ ofFirst: 0.15, ofPrevious: 0.25, lost: 90 });
    expect(view[3].ofPrevious).toBeCloseTo(0.1);
  });

  it("reste lisible sans inscrit", () => {
    const view = funnelView([{ id: "a", label: "A", n: 0 }, { id: "b", label: "B", n: 0 }]);
    expect(view.map((s) => s.ofFirst)).toEqual([null, null]);
    expect(view[1].ofPrevious).toBeNull();
  });
});

describe("données collectées avec accord", () => {
  it("borne la durée d'une vue entre 1 s et 30 min", () => {
    expect(viewSeconds(0.2)).toBeNull();
    expect(viewSeconds("x")).toBeNull();
    expect(viewSeconds(42.4)).toBe(42);
    expect(viewSeconds(99_999)).toBe(1800);
  });

  it("réduit une recherche sans résultat et écarte adresses, liens et numéros", () => {
    expect(missQuery("  Économie   DU Travail !! ")).toBe("economie du travail");
    expect(missQuery("jean.dupont@univ.fr")).toBeNull();
    expect(missQuery("https://exemple.fr")).toBeNull();
    expect(missQuery("étudiant 21904567")).toBeNull();
    expect(missQuery("ab")).toBeNull();
    expect(missQuery("x".repeat(100))).toHaveLength(60);
  });
});

describe("filtres et liens", () => {
  it("lit licence, année et matière, et ignore le reste", () => {
    expect(filtersOf({ licence: "2", annee: "3", matiere: "17" })).toEqual({ programId: 2, level: 3, subjectId: 17 });
    expect(filtersOf({ annee: "4", matiere: "-1; drop" }, 5)).toEqual({ programId: 5, level: null, subjectId: null });
    expect(filtersOf({ licence: "toutes" }, 5).programId).toBeNull();
  });

  it("garde période et filtres dans le lien vers le détail", () => {
    expect(statsHref({ jours: "90", licence: "2", vue: undefined }, { vue: "contenus", matiere: 4 })).toBe("/admin/statistiques?jours=90&licence=2&vue=contenus&matiere=4");
    expect(statsHref({ vue: "audience" }, { vue: null })).toBe("/admin/statistiques");
  });

  it("écrit une durée dans l'unité qui se lit", () => {
    expect(formatSeconds(45)).toBe("45 s");
    expect(formatSeconds(150)).toBe("2 min 30 s");
    expect(formatSeconds(3900)).toBe("1 h 05");
    expect(formatSeconds(null)).toBe("—");
  });
});
