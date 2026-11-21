import { describe, expect, it } from "vitest";
import { bannerUnlock, fontUnlock, frameUnlock, hueUnlock, unlocks, type UnlockContext } from "@/lib/unlocks";

const ctx = (patch: Partial<UnlockContext> = {}): UnlockContext => ({ credits: 0, published: 0, badges: new Set(), bestStreak: 0, moderator: false, seasonTrophies: 0, grants: new Set(), bannerImages: true, ...patch });

describe("déblocages de la personnalisation", () => {
  it("à 0 crédit, tout ce qui se gagne est verrouillé avec sa condition et son chemin", () => {
    const state = unlocks(ctx());
    for (const item of Object.values(state).filter((i) => i.id !== "offert")) {
      expect(item.open).toBe(false);
      expect(item.condition.length).toBeGreaterThan(3);
    }
    expect(state["police-nom"].condition).toBe("60 crédits · ou badge « Correcteur II »");
    expect(state["police-nom"].hint).toContain("2 cours");
    expect(state["police-nom"].path).toBe("/contribuer");
  });
  it("le chemin mène à la demande la plus votée de sa matière quand il y en a une", () => {
    expect(unlocks(ctx({ requestHref: "/demandes?matiere=3" }))["couleur-nom"].path).toBe("/demandes?matiere=3");
  });
  it("à 60 crédits : couleur, couleurs du profil, bannière et police ; pas encore le dégradé", () => {
    const state = unlocks(ctx({ credits: 60 }));
    expect(state["couleur-nom"].open && state["couleurs-profil"].open && state.banniere.open && state["police-nom"].open).toBe(true);
    expect(state["degrade-nom"].open).toBe(false);
    expect(state["banniere-image"].open).toBe(false);
  });
  it("certaines polices et cadres se gagnent par un badge, un rôle ou un trophée", () => {
    expect(unlocks(ctx({ credits: 999 }))["police-caveat"].open).toBe(false);
    expect(unlocks(ctx({ badges: new Set(["scribe-3"]) }))["police-caveat"].open).toBe(true);
    expect(unlocks(ctx({ moderator: true }))["cadre-bouclier"].open).toBe(true);
    expect(unlocks(ctx({ seasonTrophies: 1 })).effets.open).toBe(true);
    expect(unlocks(ctx({ bestStreak: 7 }))["cadre-serie"].open).toBe(true);
  });
  it("un compte tout neuf a déjà des teintes, des polices, des bannières et des cadres offerts", () => {
    const state = unlocks(ctx());
    expect(state[hueUnlock(135)].open).toBe(true);
    expect(state[hueUnlock(0)].open).toBe(false);
    expect(state[fontUnlock("serif")].open).toBe(true);
    expect(state[bannerUnlock("aurore", "gradient")].open).toBe(true);
    expect(state[bannerUnlock("braise", "gradient")].open).toBe(false);
    expect(state[frameUnlock("anneau")!].open).toBe(true);
    expect(state[frameUnlock("prisme")!].open).toBe(false);
  });
  it("un objet accordé par un administrateur est ouvert ; l'image de bannière disparaît si l'admin la coupe", () => {
    expect(unlocks(ctx({ grants: new Set(["degrade-nom"]) }))["degrade-nom"].open).toBe(true);
    expect(unlocks(ctx({ credits: 999, bannerImages: false }))["banniere-image"].open).toBe(false);
  });
});
