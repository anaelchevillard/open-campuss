/** Mes documents : onglets, tri, filtres et jauge d'un brouillon. Fonctions pures, partagées par la page et ses tests. */
import type { DocStatus } from "@/components/status-badge";

export type MyDoc = {
  id: string; title: string; category: "cours" | "fiche" | "td" | "partiel" | "projet"; kind: string;
  subjectId: number | null; subject: string | null; chapter: number | null; semester: number | null; academicYear: string;
  coverFileId: string | null; teacherName: string; rightsBasis: string; bodyLength: number;
  status: DocStatus; published: boolean; updatedAt: string; deletedAt: string | null; trashDaysLeft: number | null;
  readers: number; readersWeek: number; ratingAvg: number | null; ratingCount: number; openQuestions: number;
  reviewNote: string | null; reviewer: string | null; reasonCode: number | null; waitingSince: string | null;
};

export const MY_TABS = [
  { value: "tous", label: "Tous" },
  { value: "brouillons", label: "Brouillons" },
  { value: "attente", label: "En attente" },
  { value: "corriger", label: "À corriger" },
  { value: "publies", label: "Publiés" },
  { value: "corbeille", label: "Corbeille" },
] as const;
export type MyTab = (typeof MY_TABS)[number]["value"];

export const MY_SORTS = [
  { value: "recent", label: "Récent" },
  { value: "lus", label: "Plus lus" },
  { value: "notes", label: "Mieux notés" },
  { value: "az", label: "A-Z" },
] as const;
export type MySort = (typeof MY_SORTS)[number]["value"];

export type MyView = "grille" | "liste";

export type MyQuery = { tab: MyTab; q: string; subject: string; type: string; year: string; sort: MySort; view: MyView | null };

const pick = <T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T) => (allowed.includes(value as T) ? (value as T) : fallback);

export function parseMyQuery(get: (key: string) => string | null | undefined): MyQuery {
  const view = get("vue");
  return {
    tab: pick(get("onglet"), MY_TABS.map((t) => t.value), "tous"),
    q: (get("q") ?? "").slice(0, 120),
    subject: get("matiere") ?? "",
    type: get("type") ?? "",
    year: get("annee") ?? "",
    sort: pick(get("tri"), MY_SORTS.map((s) => s.value), "recent"),
    view: view === "liste" || view === "grille" ? view : null,
  };
}

/** Seules les valeurs qui diffèrent du défaut vont dans l'adresse : un lien partagé reste court. */
export function myQueryString(query: MyQuery) {
  const params = new URLSearchParams();
  if (query.tab !== "tous") params.set("onglet", query.tab);
  if (query.q) params.set("q", query.q);
  if (query.subject) params.set("matiere", query.subject);
  if (query.type) params.set("type", query.type);
  if (query.year) params.set("annee", query.year);
  if (query.sort !== "recent") params.set("tri", query.sort);
  if (query.view) params.set("vue", query.view);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function tabOf(status: DocStatus): Exclude<MyTab, "tous"> {
  switch (status) {
    case "trash": return "corbeille";
    case "draft": return "brouillons";
    case "pending": return "attente";
    case "tofix": return "corriger";
    default: return "publies";
  }
}

export const inTab = (doc: Pick<MyDoc, "status">, tab: MyTab) => (tab === "tous" ? doc.status !== "trash" : tabOf(doc.status) === tab);

export function tabCounts(docs: Pick<MyDoc, "status">[]) {
  const counts = Object.fromEntries(MY_TABS.map((t) => [t.value, 0])) as Record<MyTab, number>;
  for (const doc of docs) {
    counts[tabOf(doc.status)]++;
    if (doc.status !== "trash") counts.tous++;
  }
  return counts;
}

/** Recherche sans accents ni casse, sur le titre et la matière. */
export const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function filterMyDocs<T extends MyDoc>(docs: T[], query: MyQuery): T[] {
  const words = fold(query.q).split(/\s+/).filter(Boolean);
  return docs.filter((doc) => {
    if (!inTab(doc, query.tab)) return false;
    if (query.subject && String(doc.subjectId ?? "") !== query.subject) return false;
    if (query.type && doc.category !== query.type) return false;
    if (query.year && doc.academicYear !== query.year) return false;
    if (words.length) {
      const hay = fold(`${doc.title} ${doc.subject ?? ""}`);
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

export function sortMyDocs<T extends MyDoc>(docs: T[], sort: MySort): T[] {
  const byDate = (a: T, b: T) => b.updatedAt.localeCompare(a.updatedAt);
  const sorted = [...docs];
  if (sort === "lus") sorted.sort((a, b) => b.readers - a.readers || byDate(a, b));
  else if (sort === "notes") sorted.sort((a, b) => (b.ratingAvg ?? -1) - (a.ratingAvg ?? -1) || b.ratingCount - a.ratingCount || byDate(a, b));
  else if (sort === "az") sorted.sort((a, b) => (a.title.trim() || "Sans titre").localeCompare(b.title.trim() || "Sans titre", "fr", { sensitivity: "base" }));
  else sorted.sort(byDate);
  return sorted;
}

// Sous ce nombre de caractères, un cours n'a pas encore de quoi être relu
export const MIN_BODY = 400;

/** Ce qui manque à un brouillon pour être envoyé : la jauge de la carte. */
export function draftMissing(doc: Pick<MyDoc, "title" | "subjectId" | "rightsBasis" | "bodyLength">) {
  const checks = [
    { label: "titre", ok: doc.title.trim().length >= 3 },
    { label: "matière", ok: doc.subjectId !== null },
    { label: "origine", ok: doc.rightsBasis !== "unknown" },
    { label: "contenu", ok: doc.bodyLength >= MIN_BODY },
  ];
  const missing = checks.filter((c) => !c.ok).map((c) => c.label);
  return { missing, progress: Math.round(((checks.length - missing.length) / checks.length) * 100) };
}

/** Variation d'une semaine sur l'autre, en pourcentage arrondi ; null quand la semaine passée était vide. */
export function trend(now: number, before: number) {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

/** « 4,6 » : une décimale, virgule française. */
export const formatRating = (value: number | null) => (value === null ? "" : value.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
