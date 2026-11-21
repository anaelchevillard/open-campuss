import { describe, expect, it } from "vitest";
import { followNotification, matchesShownName, relationOf, searchTerm, type FollowedDoc } from "@/lib/people-rules";
import { shortName } from "@/lib/user-name-rules";

describe("recherche de personnes", () => {
  it("refuse moins de 2 caractères et nettoie les espaces", () => {
    expect(searchTerm("a")).toBeNull();
    expect(searchTerm("   ")).toBeNull();
    expect(searchTerm(undefined)).toBeNull();
    expect(searchTerm("  Léa   Mar ")).toBe("Léa Mar");
  });
  it("coupe un texte trop long", () => {
    expect(searchTerm("x".repeat(500))?.length).toBe(60);
  });
  it("donne le lien entre deux personnes", () => {
    expect(relationOf("moi", undefined)).toBe("none");
    expect(relationOf("moi", { requesterId: "moi", status: "refused" })).toBe("none");
    expect(relationOf("moi", { requesterId: "moi", status: "pending" })).toBe("sent");
    expect(relationOf("moi", { requesterId: "autre", status: "pending" })).toBe("received");
    expect(relationOf("moi", { requesterId: "autre", status: "accepted" })).toBe("friends");
  });
});

describe("notifications d'abonnements", () => {
  const doc = (id: string, over: Partial<FollowedDoc> = {}): FollowedDoc => ({ id, title: `Cours ${id}`, subjectId: 1, subject: "Droit civil", programId: 7, authors: ["auteur"], ...over });
  const me = { id: "moi", programId: 7 };
  const name = () => "Léa M.";
  const none = new Set<string>();

  it("annonce un cours d'une personne suivie, avec son nom court", () => {
    const n = followNotification([doc("a")], { people: new Set(["auteur"]), subjects: new Set() }, me, none, "2026-11-13", name);
    expect(n).toMatchObject({ kind: "new_course", title: "Léa M. a publié un cours", href: "/d/a", dedupeKey: "follows:2026-11-13" });
  });
  it("regroupe plusieurs cours en un seul rappel par jour", () => {
    const n = followNotification([doc("a"), doc("b", { subjectId: 2, authors: ["x"] })], { people: new Set(["auteur"]), subjects: new Set([2]) }, me, none, "j", name);
    expect(n?.title).toBe("2 nouveaux cours dans tes abonnements");
    expect(n?.href).toBe("/amis?onglet=abonnements");
  });
  it("ignore ses propres cours, ceux d'une autre licence et ceux déjà annoncés", () => {
    const follows = { people: new Set(["auteur", "moi"]), subjects: new Set([1]) };
    expect(followNotification([doc("a", { authors: ["moi"] })], follows, me, none, "j", name)).toBeNull();
    expect(followNotification([doc("a", { programId: 8 })], follows, me, none, "j", name)).toBeNull();
    expect(followNotification([doc("a")], follows, me, new Set(["a"]), "j", name)).toBeNull();
  });
  it("ne dit rien sans abonnement correspondant", () => {
    expect(followNotification([doc("a")], { people: new Set(), subjects: new Set([9]) }, me, none, "j", name)).toBeNull();
  });
});

describe("recherche de personnes : le nom caché ne sert pas de critère", () => {
  it("un non-ami ne se trouve pas par son nom de famille, seulement par ce qui s'affiche", () => {
    const shown = shortName("Léa Martin-Durand");
    expect(matchesShownName(shown, "Martin")).toBe(false);
    expect(matchesShownName(shown, "léa mar")).toBe(false);
    expect(matchesShownName(shown, "LÉA")).toBe(true);
    expect(matchesShownName(shown, "Léa M")).toBe(true);
  });
  it("un ami, dont le nom complet s'affiche, se trouve par son nom de famille", () => {
    expect(matchesShownName("Léa Martin-Durand", "martin")).toBe(true);
  });
});
