import { describe, expect, it } from "vitest";
import { TtlCache } from "@/lib/ttl-cache";

const clocked = (max = 2, ttl = 1000) => {
  const clock = { now: 0 };
  return { clock, cache: new TtlCache<number>(max, ttl, () => clock.now) };
};

describe("TtlCache", () => {
  it("oublie une entrée à l'échéance, sans la prolonger à la lecture", () => {
    const { clock, cache } = clocked();
    cache.set("a", 1);
    clock.now = 999;
    expect(cache.get("a")).toBe(1);
    clock.now = 1000;
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("ne dépasse jamais sa taille et évince la moins récemment lue", () => {
    const { cache } = clocked(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect(cache.size).toBe(2);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
  });

  it("garde une valeur nulle ou zéro comme une vraie valeur", async () => {
    const { cache } = clocked();
    let calls = 0;
    const load = async () => { calls += 1; return 0; };
    await cache.getOrLoad("a", load);
    await cache.getOrLoad("a", load);
    expect(calls).toBe(1);
  });

  it("ne lance qu'un chargement pour des requêtes simultanées", async () => {
    const { cache } = clocked();
    let calls = 0;
    const load = async () => { calls += 1; await Promise.resolve(); return 7; };
    expect(await Promise.all([cache.getOrLoad("a", load), cache.getOrLoad("a", load)])).toEqual([7, 7]);
    expect(calls).toBe(1);
  });

  it("sépare les clés : un compte ne lit jamais la valeur d'un autre", async () => {
    const { cache } = clocked();
    expect(await cache.getOrLoad("alice", async () => 1)).toBe(1);
    expect(await cache.getOrLoad("bob", async () => 2)).toBe(2);
    expect(cache.get("alice")).toBe(1);
  });

  it("ne garde pas un échec", async () => {
    const { cache } = clocked();
    await expect(cache.getOrLoad("a", async () => { throw new Error("base"); })).rejects.toThrow("base");
    expect(await cache.getOrLoad("a", async () => 1)).toBe(1);
  });

  it("ne garde pas une lecture commencée avant une invalidation", async () => {
    const { cache } = clocked();
    let release = () => {};
    const slow = cache.getOrLoad("a", () => new Promise<number>((resolve) => { release = () => resolve(1); }));
    cache.delete("a");
    expect(await cache.getOrLoad("a", async () => 2)).toBe(2);
    release();
    expect(await slow).toBe(1);
    expect(cache.get("a")).toBe(2);
  });

  it("clear oublie tout", async () => {
    const { cache } = clocked();
    cache.set("a", 1);
    cache.clear();
    expect(cache.get("a")).toBeUndefined();
  });
});
