import { describe, expect, it } from "vitest";
import { mergeQuery, rulesFromParams, splitQuery } from "@/components/admin/url-filters-state";
import type { FilterQuery } from "@/components/reui/filters/filters-types";

const IDS = ["etat", "matiere", "semestre"];
const q = (rules: FilterQuery<string | string[]>["rules"]): FilterQuery<string | string[]> => ({ id: "root", type: "group", combinator: "and", rules });

describe("Filtres de l'administration dans l'URL", () => {
  it("garde à l'écran un critère choisi sans valeur (ReUI l'ajoute avec value undefined)", () => {
    // Ce que ReUI émet quand on choisit « État » dans le menu Filtrer
    const next = q([{ id: "f1", type: "rule", path: ["etat"], operator: "", value: undefined }]);
    const { patch, drafts, rules } = splitQuery(IDS, next);
    expect(patch).toEqual({ etat: null, matiere: null, semestre: null });
    expect(drafts).toHaveLength(1);
    // L'URL n'a pas bougé : le critère reste affiché, ReUI peut ouvrir le choix de la valeur
    expect(mergeQuery([], rules, true).rules).toHaveLength(1);
    // Même après une autre navigation (recherche), il n'est pas perdu
    expect(mergeQuery([], rules, false).rules.map((r) => r.id)).toEqual(["f1"]);
  });

  it("écrit dans l'URL un critère complet, à une ou plusieurs valeurs", () => {
    const next = q([
      { id: "f1", type: "rule", path: ["etat"], operator: "is", value: "published" },
      { id: "f2", type: "rule", path: ["semestre"], operator: "is_any_of", value: ["1", "2"] },
    ]);
    expect(splitQuery(IDS, next).patch).toEqual({ etat: "published", matiere: null, semestre: "1,2" });
  });

  it("retirer un critère l'efface de l'URL", () => {
    expect(splitQuery(IDS, q([])).patch).toEqual({ etat: null, matiere: null, semestre: null });
  });

  it("relit l'URL et ne double pas un critère déjà posé", () => {
    const params = new URLSearchParams("etat=draft,pending&matiere=4");
    const fromUrl = rulesFromParams(IDS, (id) => params.get(id));
    expect(fromUrl).toEqual([
      { id: "r-etat", type: "rule", path: ["etat"], operator: "is_any_of", value: ["draft", "pending"] },
      { id: "r-matiere", type: "rule", path: ["matiere"], operator: "is", value: "4" },
    ]);
    const local = [{ id: "f9", type: "rule" as const, path: ["matiere"], operator: "", value: undefined }];
    expect(mergeQuery(fromUrl, local).rules).toHaveLength(2);
  });

  it("ignore un critère inconnu", () => {
    const next = q([{ id: "x", type: "rule", path: ["auteur_id"], operator: "is", value: "1" }]);
    expect(splitQuery(IDS, next).patch).not.toHaveProperty("auteur_id");
  });
});
