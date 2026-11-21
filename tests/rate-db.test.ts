import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

// Sur une base jetable seulement : DATABASE_URL=postgres://… npx vitest run tests/rate-db.test.ts
describe.skipIf(!process.env.DATABASE_URL)("limites de débit en rafale, sur une vraie base", async () => {
  const { rateHit, rateLimited, rateTake, rateTakeAll } = await import("@/lib/security");

  it("rateTake : en rafale, jamais plus que la limite ; à la suite, exactement la limite", async () => {
    const burst = `test-take:${randomUUID()}`;
    const passed = (await Promise.all(Array.from({ length: 40 }, () => rateTake(burst, 6, 15)))).filter(Boolean).length;
    expect(passed).toBeLessThanOrEqual(6);
    const serial = `test-serial:${randomUUID()}`;
    const results: boolean[] = [];
    for (let i = 0; i < 10; i++) results.push(await rateTake(serial, 6, 15));
    expect(results).toEqual([true, true, true, true, true, true, false, false, false, false]);
  });

  it("l'ancien schéma (vérifier puis inscrire) laissait passer bien plus que la limite", async () => {
    const key = `test-old:${randomUUID()}`;
    const old = async () => { if (await rateLimited(key, 6, 15)) return false; await rateHit(key); return true; };
    const passed = (await Promise.all(Array.from({ length: 40 }, old))).filter(Boolean).length;
    expect(passed).toBeGreaterThan(6);
  });

  it("rateTakeAll : un refus libéré ne compte pas, et la rafale reste bornée", async () => {
    const key = `test-all:${randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 30 }, async () => {
      const take = await rateTakeAll([[key, 8, 15]]);
      if (!take.ok) await take.release();
      return take.ok;
    }));
    const passed = results.filter(Boolean).length;
    expect(passed).toBeLessThanOrEqual(8);
    // Les refus libérés ne restent pas : seuls les essais admis sont comptés
    expect(await rateLimited(key, passed + 1, 15)).toBe(false);
  });
});
