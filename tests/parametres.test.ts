import { describe, expect, it } from "vitest";
import { unsentFields } from "@/components/save-guard";
import { SECTIONS, sectionsFor } from "@/components/profile/settings/sections";
import { yearLimited } from "@/lib/catalog";

type Fake = { tagName: string; type?: string; value: string; defaultValue: string; disabled?: boolean; readOnly?: boolean; closest: () => null };
const field = (f: Partial<Fake>): Fake => ({ tagName: "INPUT", type: "text", value: "", defaultValue: "", closest: () => null, ...f });
const root = (fields: Fake[]) => ({ querySelectorAll: () => fields }) as unknown as HTMLElement;

describe("garde de sortie des formulaires de compte", () => {
  it("un mot de passe tapé mais pas envoyé retient la fermeture de l'onglet", () => {
    expect(unsentFields(root([field({ type: "password", value: "secret" })]))).toBe(true);
    expect(unsentFields(root([field({ tagName: "TEXTAREA", type: undefined, value: "bio" })]))).toBe(true);
  });
  it("rien n'est retenu sans saisie, ni pour les champs cachés, les fichiers ou la recherche", () => {
    expect(unsentFields(root([field({ value: "a", defaultValue: "a" })]))).toBe(false);
    expect(unsentFields(root([field({ type: "hidden", value: "x" }), field({ type: "file", value: "c:/x.png" }), field({ type: "search", value: "mot" })]))).toBe(false);
    expect(unsentFields(root([field({ value: "x", disabled: true }), field({ value: "x", readOnly: true })]))).toBe(false);
    expect(unsentFields(null)).toBe(false);
  });
});

describe("accueil des paramètres", () => {
  it("chaque section dit ce qu'on y règle", () => {
    for (const section of SECTIONS) expect(section.hint.length, section.id).toBeGreaterThan(10);
  });
  it("Comptes connectés figure toujours dans la liste", () => {
    expect(sectionsFor("member", true).map((s) => s.id)).toContain("comptes-connectes");
  });
});

describe("matières de son année", () => {
  it("un étudiant avec une année est limité ; l'administration et les enseignants gardent tout", () => {
    expect(yearLimited({ role: "member", level: 2 })).toBe(true);
    expect(yearLimited({ role: "delegate", level: 1 })).toBe(true);
    expect(yearLimited({ role: "admin", level: 2 })).toBe(false);
    expect(yearLimited({ role: "teacher", level: 3 })).toBe(false);
    expect(yearLimited({ role: "member", level: null })).toBe(false);
  });
});
