import { describe, expect, it } from "vitest";
import { cleanHomeWidgets, homeWidgetOrder, visibleHomeWidgets } from "../src/lib/home-widgets";
import { cleanPrefs } from "../src/lib/prefs";

describe("widgets de l'accueil", () => {
  it("par défaut : tous visibles, dans l'ordre du catalogue", () => {
    expect(visibleHomeWidgets(undefined)).toEqual(["exams", "likes", "code", "streak", "friends", "ai"]);
    expect(cleanHomeWidgets({ order: ["exams"], hidden: [] })).toBeUndefined();
  });
  it("garde l'ordre choisi, complète avec les widgets manquants, ignore l'inconnu", () => {
    const pref = cleanHomeWidgets({ order: ["ai", "nope", "streak", "ai"], hidden: ["code", "x"] });
    expect(pref).toEqual({ order: ["ai", "streak", "exams", "likes", "code", "friends"], hidden: ["code"] });
    expect(visibleHomeWidgets(pref)).toEqual(["ai", "streak", "exams", "likes", "friends"]);
    expect(homeWidgetOrder({ order: [], hidden: [] })).toHaveLength(6);
  });
  it("passe par cleanPrefs sans rien laisser d'étranger", () => {
    expect(cleanPrefs({ homeWidgets: { order: ["friends"], hidden: [], evil: 1 } }).homeWidgets).toEqual({ order: ["friends", "exams", "likes", "code", "streak", "ai"], hidden: [] });
    expect(cleanPrefs({ homeWidgets: "x" }).homeWidgets).toBeUndefined();
  });
});
