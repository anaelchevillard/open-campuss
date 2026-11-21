import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canSeePack, goodSession, PUBLISH_MIN_CARDS, publishRefusal, shouldInvitePublish, type PublishState } from "../src/lib/memo-pack-rules";

const base: PublishState = { cards: 12, programId: 3, pack: null };
const actions = readFileSync(new URL("../src/app/actions/packs.ts", import.meta.url), "utf8");
const body = (name: string) => actions.slice(actions.indexOf(`export async function ${name}`), actions.indexOf("\nexport ", actions.indexOf(`export async function ${name}`) + 10));

describe("Publier un paquet : quand inviter", () => {
  it("invite un paquet assez fourni, jamais publié ni refusé", () => {
    expect(shouldInvitePublish(base)).toBe(true);
    expect(shouldInvitePublish({ ...base, cards: PUBLISH_MIN_CARDS - 1 })).toBe(false);
  });

  it("ne redemande pas une fois refusé, ni s'il est déjà public", () => {
    expect(shouldInvitePublish({ ...base, pack: { public: false, removedAt: null, publishDeclinedAt: new Date() } })).toBe(false);
    expect(shouldInvitePublish({ ...base, pack: { public: true, removedAt: null, publishDeclinedAt: null } })).toBe(false);
  });

  it("un paquet retiré par la modération ou sans licence n'est ni proposé ni publiable", () => {
    const removed = { ...base, pack: { public: false, removedAt: new Date(), publishDeclinedAt: null } };
    expect(shouldInvitePublish(removed)).toBe(false);
    expect(publishRefusal(removed)).toMatch(/retiré/);
    expect(publishRefusal({ ...base, programId: null })).toMatch(/licence/);
    expect(publishRefusal({ ...base, cards: 0 })).toMatch(/aucune fiche/);
    expect(publishRefusal(base)).toBeNull();
  });

  it("une bonne séance : 5 fiches au moins, 80 % de réussite", () => {
    expect(goodSession(10, 8)).toBe(true);
    expect(goodSession(10, 7)).toBe(false);
    expect(goodSession(4, 4)).toBe(false);
    expect(goodSession(0, 0)).toBe(false);
  });

  it("publié : lu par la licence, plus par personne d'autre une fois retiré (sauf auteur et modération)", () => {
    const pack = { ownerId: "a", programId: 3, friends: false, public: true, removedAt: null };
    expect(canSeePack({ id: "b", role: "member", programId: 3 }, pack, false)).toBe(true);
    expect(canSeePack({ id: "c", role: "member", programId: 4 }, pack, false)).toBe(false);
    expect(canSeePack({ id: "b", role: "member", programId: 3 }, { ...pack, removedAt: new Date() }, false)).toBe(false);
    expect(canSeePack({ id: "d", role: "delegate", programId: 3 }, { ...pack, removedAt: new Date() }, false)).toBe(true);
  });
});

describe("Publier un paquet : garde-fous serveur", () => {
  it("publier, refuser et partager ne portent que sur les fiches de la personne et sont limités", () => {
    for (const name of ["publishPack", "declinePublish", "sharePack"]) {
      const code = body(name);
      expect(code, name).toContain("requireUser()");
      expect(code, name).toMatch(/shareLimited\(user\.id\)/);
      expect(code, name).toMatch(/myScope\(user\.id|eq\(flashcards\.userId, user\.id\)/);
    }
    expect(actions).toMatch(/rateLimited\(key, SHARE_PER_DAY, 1440\)/);
  });

  it("la publication passe par la même règle que l'invitation, et la modération après coup reste", () => {
    expect(body("publishPack")).toContain("publishRefusal(");
    expect(actions).toContain("export async function reportPack");
    expect(body("moderatePack")).toContain("requireModerator()");
    expect(body("moderatePack")).toContain("canModeratePack(user, pack)");
  });

  it("l'aperçu ne lit que mes fiches", () => {
    expect(body("publishPreview")).toMatch(/myScope\(user\.id, scope\)/);
    expect(body("publishPreview")).not.toMatch(/ownerId, (?!user\.id)/);
  });
});

describe("Ressources de Réviser : paquets de la promo", () => {
  it("« Réviser » et « Copier » ne lisent qu'un paquet lisible, non retiré, et passent par la même copie limitée", () => {
    for (const name of ["copyPack", "revisePack"]) {
      const code = body(name);
      expect(code, name).toContain("readablePack(user,");
      expect(code, name).toContain("pack.removedAt");
    }
    expect(body("revisePack")).toContain("copyCards(user, pack)");
    expect(body("copyPack")).toContain("copyCards(user, pack)");
    expect(actions).toMatch(/rateLimited\(key, 20, 1440\)/);
  });

  it("les fiches copiées ne se rattachent qu'à un cours que la personne peut lire", () => {
    expect(actions.slice(actions.indexOf("async function copyTarget"), actions.indexOf("async function copyCards"))).toContain("canRead(user, doc)");
  });

  it("un sujet de partiel ne figure plus dans les nouveautés de l'accueil", () => {
    const home = readFileSync(new URL("../src/components/home/data.ts", import.meta.url), "utf8");
    expect(home).toContain('ne(documents.category, "partiel")');
  });
});
