import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AVATAR_FRAMES, avatarFrameOf } from "@/lib/name-style";
import { frameUnlock, UNLOCK_IDS, type UnlockId } from "@/lib/unlocks";

// Cadres d'avatar animés, sur une liste fermée vérifiée par le serveur, coupés en mouvement réduit.

const state = vi.hoisted(() => ({ open: new Set<string>(), writes: [] as Record<string, unknown>[] }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "u1", role: "member" }), requireUserAny: vi.fn(), currentUser: vi.fn() }));
vi.mock("@/lib/security", () => ({ rateHit: vi.fn(), rateLimited: async () => false }));
vi.mock("@/lib/gamification", () => ({
  syncBadges: vi.fn(),
  profileStanding: async () => ({
    earned: new Set<string>(),
    unlocked: new Proxy({}, { get: (_target, id: string) => ({ id, open: state.open.has(id) }) }),
  }),
}));
vi.mock("@/lib/profile-data", () => ({ forgetProfileCaches: vi.fn() }));
vi.mock("@/lib/shell-cache", () => ({ forgetShellCounters: vi.fn() }));
vi.mock("@/lib/catalog", () => ({ yearLimited: vi.fn() }));
vi.mock("@/lib/friends", () => ({ isBlockedBetween: vi.fn() }));
vi.mock("@/lib/people", () => ({ canViewProfile: vi.fn() }));
vi.mock("@/app/actions/friends", () => ({ requestFriend: vi.fn() }));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  const db = {
    select: () => ({ from: () => ({ where: async () => [] }) }),
    insert: () => ({ values: (row: Record<string, unknown>) => ({ onConflictDoUpdate: async () => { state.writes.push(row); } }) }),
  };
  return { db, schema };
});

const { saveAppearance } = await import("@/app/actions/social");
const css = readFileSync(join(process.cwd(), "src/styles/name-fonts.css"), "utf8");
const animated = AVATAR_FRAMES.filter((f) => f.animated);

beforeEach(() => { state.open = new Set(["offert"]); state.writes = []; });

describe("liste des cadres", () => {
  it("garde des identifiants uniques, Comète et au moins quatre autres cadres animés", () => {
    const ids = AVATAR_FRAMES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("comete");
    expect(animated.filter((f) => f.id !== "comete" && f.id !== "prisme").length).toBeGreaterThanOrEqual(4);
  });

  it("ne reconnaît que les identifiants de la liste", () => {
    for (const f of AVATAR_FRAMES) expect(avatarFrameOf(f.id)?.id).toBe(f.id);
    for (const bad of ["", "COMETE", "comete ", "__proto__", "constructor", "toString", "inconnu", 42, null, undefined, { id: "comete" }, ["comete"]]) {
      expect(avatarFrameOf(bad), String(bad)).toBeNull();
    }
  });

  it("soumet chaque cadre à une règle de déverrouillage, les animés à « Cadre animé »", () => {
    for (const f of AVATAR_FRAMES) {
      const rule = frameUnlock(f.id);
      expect(rule, f.id).not.toBeNull();
      expect(UNLOCK_IDS).toContain(rule as UnlockId);
      if (f.animated) expect(rule, f.id).toBe("cadre-anime");
    }
    expect(frameUnlock("inconnu")).toBeNull();
    expect(frameUnlock("__proto__")).toBeNull();
  });
});

describe("rendu des cadres animés (name-fonts.css)", () => {
  const motionBlock = css.slice(css.indexOf("@media (prefers-reduced-motion: no-preference) {\n  html:not(.reduce-motion) .avatar-frame[data-frame=\"prisme\"]"));
  const motion = motionBlock.slice(0, motionBlock.indexOf("\n}\n"));
  const keyframes = (name: string) => {
    const at = css.indexOf(`@keyframes ${name} `);
    return css.slice(at, css.indexOf("\n", at));
  };

  it("a un style et une animation pour chaque cadre animé, seulement hors mouvement réduit", () => {
    for (const f of animated) {
      expect(css, f.id).toContain(`[data-frame="${f.id}"]`);
      expect(motion, f.id).toMatch(new RegExp(`html:not\\(\\.reduce-motion\\) \\.avatar-frame\\[data-frame="${f.id}"\\]::(before|after) \\{[^}]*animation:`));
    }
    // Aucune animation de cadre en dehors du bloc « no-preference »
    const outside = css.replace(motion, "");
    expect(outside).not.toMatch(/\.avatar-frame[^{]*\{[^}]*animation:\s*frame-(turn|pulse|twinkle)/);
  });

  it("n'anime que transform et opacity (pas de repeint par image)", () => {
    for (const name of ["frame-turn", "frame-turn-back", "frame-pulse", "frame-twinkle"]) {
      const body = keyframes(name);
      expect(body, name).not.toBe("");
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      for (const p of props) expect(["transform", "opacity"], `${name} : ${p}`).toContain(p);
    }
    expect(css).not.toContain("--frame-angle");
    for (const line of motion.split("\n").filter((l) => l.includes("will-change"))) {
      expect(line.match(/will-change:\s*([^;]+);/)?.[1].split(",").map((s) => s.trim()).every((v) => v === "transform" || v === "opacity")).toBe(true);
    }
  });
});

describe("saveAppearance : cadre vérifié par le serveur", () => {
  it("refuse un identifiant hors de la liste, sans rien écrire", async () => {
    for (const bad of ["inconnu", "__proto__", "comete<script>"]) {
      expect(await saveAppearance({ avatarFrame: bad })).toEqual({ ok: false, error: "Cadre inconnu" });
    }
    expect(state.writes).toHaveLength(0);
  });

  it("refuse un cadre animé tant que « Cadre animé » n'est pas débloqué", async () => {
    for (const f of animated) expect(await saveAppearance({ avatarFrame: f.id }), f.id).toEqual({ ok: false, error: "Ce cadre : pas encore débloqué" });
    expect(state.writes).toHaveLength(0);
  });

  it("enregistre un cadre animé débloqué, et le retrait du cadre", async () => {
    state.open.add("cadre-anime");
    expect(await saveAppearance({ avatarFrame: "orbite" })).toEqual({ ok: true });
    expect(await saveAppearance({ avatarFrame: null })).toEqual({ ok: true });
    expect(state.writes.map((w) => w.avatarFrame)).toEqual(["orbite", null]);
  });
});
