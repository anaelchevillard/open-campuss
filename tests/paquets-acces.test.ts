import { describe, expect, it } from "vitest";
import { canModeratePack, canSeePack, packScope } from "../src/lib/memo-pack-rules";

const owner = { id: "o", role: "student", programId: 1 };
const other = { id: "x", role: "student", programId: 1 };
const elsewhere = { id: "y", role: "student", programId: 2 };
const delegate = { id: "d", role: "delegate", programId: 1 };
const admin = { id: "a", role: "admin", programId: null };
const pack = { ownerId: "o", programId: 1, friends: false, public: false, removedAt: null };

describe("paquets de fiches", () => {
  it("un paquet privé n'est lu que par son auteur", () => {
    expect(canSeePack(owner, pack, false)).toBe(true);
    expect(canSeePack(other, pack, true)).toBe(false);
  });
  it("partagé aux amis : lu par les amis seulement", () => {
    const shared = { ...pack, friends: true };
    expect(canSeePack(other, shared, true)).toBe(true);
    expect(canSeePack(other, shared, false)).toBe(false);
  });
  it("public : lu dans la licence, pas ailleurs", () => {
    const pub = { ...pack, public: true };
    expect(canSeePack(other, pub, false)).toBe(true);
    expect(canSeePack(elsewhere, pub, false)).toBe(false);
    expect(canSeePack(admin, pub, false)).toBe(true);
  });
  it("retiré : seuls l'auteur et la modération de la licence le voient", () => {
    const removed = { ...pack, public: true, friends: true, removedAt: new Date() };
    expect(canSeePack(other, removed, true)).toBe(false);
    expect(canSeePack(owner, removed, false)).toBe(true);
    expect(canSeePack(delegate, removed, false)).toBe(true);
    expect(canModeratePack({ ...delegate, programId: 2 }, removed)).toBe(false);
    expect(canModeratePack(admin, removed)).toBe(true);
  });
  it("les fiches sans cours forment le paquet libre", () => {
    expect(packScope(null)).toBe("libre");
    expect(packScope("abc")).toBe("abc");
  });
});
