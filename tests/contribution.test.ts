import { describe, expect, it } from "vitest";
import { statusOf } from "@/components/status-badge";
import { blockDiff, diffCounts, onlyChanges, tokenize, wordDiff } from "@/lib/line-diff";
import { draftMissing, filterMyDocs, myQueryString, parseMyQuery, sortMyDocs, tabCounts, trend, type MyDoc } from "@/lib/my-documents";
import { reasonLabel, reviewNoteOf } from "@/lib/review-reasons";

const doc = (over: Partial<MyDoc>): MyDoc => ({
  id: "x", title: "Droit civil", category: "cours", kind: "editor", subjectId: 1, subject: "Civil", chapter: null, semester: null, academicYear: "2026-2027",
  coverFileId: null, teacherName: "", rightsBasis: "own", bodyLength: 1000, status: "draft", published: false, updatedAt: "2026-11-01T10:00:00.000Z", deletedAt: null, trashDaysLeft: null,
  readers: 0, readersWeek: 0, ratingAvg: null, ratingCount: 0, openQuestions: 0, reviewNote: null, reviewer: null, reasonCode: null, waitingSince: null, ...over,
});

describe("statuts", () => {
  it("donne les 7 statuts et la corbeille selon les colonnes", () => {
    expect(statusOf({ published: false })).toBe("draft");
    expect(statusOf({ published: false, reviewNote: "Origine à préciser" })).toBe("tofix");
    expect(statusOf({ published: false, reviewRequested: true })).toBe("pending");
    expect(statusOf({ published: true })).toBe("published");
    expect(statusOf({ published: true, postReviewAt: new Date() })).toBe("postreview");
    expect(statusOf({ published: true }, true)).toBe("revision");
    expect(statusOf({ published: true, hiddenByReports: true })).toBe("hidden");
    expect(statusOf({ published: true, deletedAt: new Date() })).toBe("trash");
  });

  it("compte les onglets, la corbeille hors de « Tous »", () => {
    const counts = tabCounts([doc({ status: "draft" }), doc({ status: "tofix" }), doc({ status: "published" }), doc({ status: "revision" }), doc({ status: "trash" })]);
    expect(counts).toMatchObject({ tous: 4, brouillons: 1, corriger: 1, publies: 2, corbeille: 1, attente: 0 });
  });
});

describe("Mes documents", () => {
  it("garde dans l'adresse seulement ce qui diffère du défaut, et le relit", () => {
    const q = parseMyQuery((k) => ({ onglet: "corriger", tri: "lus", vue: "liste", q: "civil" } as Record<string, string>)[k]);
    expect(q).toMatchObject({ tab: "corriger", sort: "lus", view: "liste", q: "civil" });
    expect(myQueryString(q)).toBe("?onglet=corriger&q=civil&tri=lus&vue=liste");
    expect(myQueryString(parseMyQuery(() => "n’importe quoi"))).toBe("?q=n%E2%80%99importe+quoi&matiere=n%E2%80%99importe+quoi&type=n%E2%80%99importe+quoi&annee=n%E2%80%99importe+quoi");
    expect(parseMyQuery(() => null)).toMatchObject({ tab: "tous", sort: "recent", view: null });
  });

  it("filtre sans accents et trie", () => {
    const docs = [doc({ id: "a", title: "Énoncé", readers: 3, updatedAt: "2026-11-02T00:00:00Z" }), doc({ id: "b", title: "zèbre", readers: 9, ratingAvg: 4.5, ratingCount: 3 }), doc({ id: "c", title: "abc", status: "trash" })];
    const base = parseMyQuery(() => null);
    expect(filterMyDocs(docs, { ...base, q: "enonce" }).map((d) => d.id)).toEqual(["a"]);
    expect(filterMyDocs(docs, base).map((d) => d.id)).toEqual(["a", "b"]);
    expect(filterMyDocs(docs, { ...base, tab: "corbeille" }).map((d) => d.id)).toEqual(["c"]);
    expect(sortMyDocs(docs, "lus")[0].id).toBe("b");
    expect(sortMyDocs(docs, "notes")[0].id).toBe("b");
    expect(sortMyDocs(docs, "az").map((d) => d.id)).toEqual(["c", "a", "b"]);
    expect(sortMyDocs(docs, "recent")[0].id).toBe("a");
  });

  it("dit ce qui manque à un brouillon", () => {
    expect(draftMissing(doc({ title: "", subjectId: null, rightsBasis: "unknown", bodyLength: 10 }))).toEqual({ missing: ["titre", "matière", "origine", "contenu"], progress: 0 });
    expect(draftMissing(doc({})).missing).toEqual([]);
  });

  it("calcule la variation d'une semaine sur l'autre", () => {
    expect(trend(12, 10)).toBe(20);
    expect(trend(5, 10)).toBe(-50);
    expect(trend(3, 0)).toBeNull();
  });
});

describe("motifs", () => {
  it("compose la note gardée sur le document", () => {
    expect(reasonLabel(1)).toBe("Origine à préciser");
    expect(reasonLabel(9)).toBeNull();
    expect(reviewNoteOf(2, " il manque le chapitre 3 ")).toBe("Incomplet ou trop court : il manque le chapitre 3");
    expect(reviewNoteOf(7, "Cours de L1")).toBe("Doublon de Cours de L1");
    expect(reviewNoteOf(undefined, "texte libre")).toBe("texte libre");
  });
});

describe("diff au mot", () => {
  it("sépare mots, espaces et ponctuation", () => {
    expect(tokenize("L’arrêt, rendu.")).toEqual(["L’arrêt", ",", " ", "rendu", "."]);
  });

  it("ne marque que le mot changé", () => {
    expect(wordDiff("la faute de la victime", "la faute exclusive de la victime")).toEqual([
      { kind: "same", text: "la faute " }, { kind: "add", text: "exclusive " }, { kind: "same", text: "de la victime" },
    ]);
  });

  it("apparie une ligne retirée et une ligne ajoutée qui se ressemblent", () => {
    const blocks = blockDiff("# Titre\n\nLa responsabilité civile.\n\nFin", "# Titre\n\nLa responsabilité civile délictuelle.\n\nAjout\n\nFin");
    expect(blocks.map((b) => b.kind)).toEqual(["same", "change", "add", "same"]);
    expect(diffCounts(blocks)).toEqual({ added: 2, removed: 0 });
  });

  it("garde un bloc de contexte et compte les blocs sautés", () => {
    const before = Array.from({ length: 10 }, (_, i) => `ligne ${i}`).join("\n");
    const after = before.replace("ligne 5", "ligne cinq");
    const view = onlyChanges(blockDiff(before, after));
    expect(view.map((v) => v.kind)).toEqual(["gap", "same", "change", "same", "gap"]);
    expect(view[0]).toEqual({ kind: "gap", count: 4 });
  });
});
