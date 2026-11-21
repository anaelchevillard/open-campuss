import { describe, expect, it } from "vitest";
import { cleanSocials, socialLinks } from "@/lib/socials";
import { nameFromEmail, shortName } from "@/lib/user-name-rules";

const NAMED = ["etu.exemple.fr"];

describe("nom tiré de l'adresse universitaire", () => {
  it("prenom_nom@etu.exemple.fr donne « Prénom Nom »", () => {
    expect(nameFromEmail("lea_martin@etu.exemple.fr", NAMED)).toBe("Lea Martin");
    expect(nameFromEmail("jean-pierre_de-la-tour2@etu.exemple.fr", NAMED)).toBe("Jean-Pierre De-La-Tour");
  });
  it("les autres adresses ne donnent rien", () => {
    expect(nameFromEmail("lea.martin@etu.exemple.fr", NAMED)).toBeNull();
    expect(nameFromEmail("lea_martin@example.com", NAMED)).toBeNull();
    expect(nameFromEmail("lea_martin@etu.exemple.fr.exemple.com", NAMED)).toBeNull();
  });
  it("les non-amis voient le prénom et l'initiale du nom", () => {
    expect(shortName("Léa Martin-Durand")).toBe("Léa M.");
    expect(shortName("Léa")).toBe("Léa");
    expect(shortName("  Jean   Pierre  Dupont ")).toBe("Jean D.");
  });
});

describe("réseaux du profil", () => {
  it("garde un identifiant propre et construit le lien", () => {
    const result = cleanSocials({ instagram: "@Lea.Martin", tiktok: "", snapchat: "lea_m" });
    expect(result).toEqual({ ok: true, value: { instagram: "lea.martin", snapchat: "lea_m" } });
    expect(socialLinks({ instagram: "lea.martin" })[0].href).toBe("https://www.instagram.com/lea.martin/");
  });
  it("refuse les adresses et les caractères qui sortent du modèle", () => {
    expect(cleanSocials({ instagram: "https://evil.example/x" }).ok).toBe(false);
    expect(cleanSocials({ tiktok: "javascript:alert(1)" }).ok).toBe(false);
    expect(cleanSocials({ snapchat: "1abc" }).ok).toBe(false);
    expect(cleanSocials({ instagram: "a..b" }).ok).toBe(false);
  });
  it("un identifiant invalide déjà stocké n'est jamais affiché", () => {
    expect(socialLinks({ instagram: "x/../../y" })).toEqual([]);
  });
});
