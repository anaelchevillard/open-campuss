import { describe, expect, it } from "vitest";
import { anchorOf, locate, planClear, planToggle, segments, type Mark, type Span } from "@/lib/annotate";

const TEXT = "La rareté oblige un arbitrage. La rareté est partout.";
const mark = (id: string, kind: string, color: string | null, start: number, end: number): Mark & Span => ({ id, kind, color, ...anchorOf(TEXT, start, end) });

describe("locate", () => {
  it("retrouve le passage à sa place", () => {
    expect(locate(TEXT, anchorOf(TEXT, 3, 9))).toEqual({ start: 3, end: 9 });
  });
  it("suit le passage quand le texte change avant lui", () => {
    const anchor = anchorOf(TEXT, 31, 40);
    expect(locate(`Ajout. ${TEXT}`, anchor)).toEqual({ start: 38, end: 47 });
  });
  it("départage deux occurrences par le contexte", () => {
    const anchor = { ...anchorOf(TEXT, 34, 40), start: -1, end: -1 };
    expect(locate(TEXT, anchor)).toEqual({ start: 34, end: 40 });
  });
  it("reconnaît un passage disparu", () => {
    expect(locate("Autre texte.", anchorOf(TEXT, 3, 9))).toBeNull();
    expect(locate(TEXT, { start: -1, end: -1, quote: "", prefix: "", suffix: "" })).toBeNull();
  });
});

describe("planToggle", () => {
  it("pose une marque", () => {
    expect(planToggle([], "bold", null, { start: 0, end: 5 })).toEqual({ remove: [], add: [{ kind: "bold", color: null, span: { start: 0, end: 5 } }] });
  });
  it("retire une partie et garde le reste", () => {
    const plan = planToggle([mark("a", "bold", null, 0, 10)], "bold", null, { start: 3, end: 5 });
    expect(plan.remove).toEqual(["a"]);
    expect(plan.add.map((x) => x.span)).toEqual([{ start: 0, end: 3 }, { start: 5, end: 10 }]);
  });
  it("fusionne des marques voisines", () => {
    const plan = planToggle([mark("a", "bold", null, 0, 4), mark("b", "bold", null, 6, 10)], "bold", null, { start: 3, end: 7 });
    expect(plan.remove.sort()).toEqual(["a", "b"]);
    expect(plan.add[0].span).toEqual({ start: 0, end: 10 });
  });
  it("une nouvelle couleur remplace l'ancienne", () => {
    const plan = planToggle([mark("a", "hl", "green", 0, 10)], "hl", "yellow", { start: 2, end: 4 });
    expect(plan.remove).toEqual(["a"]);
    expect(plan.add).toContainEqual({ kind: "hl", color: "yellow", span: { start: 2, end: 4 } });
    expect(plan.add).toContainEqual({ kind: "hl", color: "green", span: { start: 0, end: 2 } });
    expect(plan.add).toContainEqual({ kind: "hl", color: "green", span: { start: 4, end: 10 } });
  });
  it("le gras ne touche pas au surlignage", () => {
    expect(planToggle([mark("a", "hl", "green", 0, 10)], "bold", null, { start: 2, end: 4 }).remove).toEqual([]);
  });
});

describe("planClear", () => {
  it("efface les marques et jamais les notes", () => {
    const plan = planClear([mark("a", "bold", null, 0, 10), mark("n", "note", null, 0, 10)], { start: 0, end: 10 });
    expect(plan).toEqual({ remove: ["a"], add: [] });
  });
});

describe("segments", () => {
  it("découpe les chevauchements", () => {
    expect(segments([{ id: "a", start: 0, end: 5 }, { id: "b", start: 3, end: 8 }])).toEqual([
      { start: 0, end: 3, ids: ["a"] }, { start: 3, end: 5, ids: ["a", "b"] }, { start: 5, end: 8, ids: ["b"] },
    ]);
  });
});
