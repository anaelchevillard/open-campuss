import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

// Sur une base jetable seulement : DATABASE_URL=postgres://… npx vitest run tests/observabilite-db.test.ts
// Les requêtes du suivi des erreurs et des événements tournent sur une vraie base.
describe.skipIf(!process.env.DATABASE_URL)("erreurs et événements, sur une vraie base", async () => {
  const { sql } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db");
  const { recordError } = await import("@/lib/errors/record");
  const { errorDetail, errorList } = await import("@/lib/errors/queries");
  const { recordVisit } = await import("@/lib/notification-state");
  const { trackEvent } = await import("@/lib/product-events");
  const { eventCohorts, eventTotals, consentedPeople } = await import("@/lib/event-queries");
  const { periodOf } = await import("@/lib/audience-calc");
  const all = { programId: null, level: null, subjectId: null };

  it("regroupe deux occurrences, compte les personnes du jour et rouvre une erreur résolue dans une autre version", async () => {
    const marker = `Panne ${randomUUID().slice(0, 8)}`;
    const report = { source: "client" as const, name: "TypeError", stack: "", route: "/d/[id]", userAgent: "Mozilla/5.0 (iPhone) Safari/605.1" };
    await recordError({ ...report, message: `${marker} doc 3f2b8c1e-1d2a-4c3b-9e8f-0a1b2c3d4e5f pour a@b.fr`, ip: "198.51.100.1" });
    await recordError({ ...report, message: `${marker} doc 9a9b8c1e-1d2a-4c3b-9e8f-0a1b2c3d4e5f pour c@d.fr`, ip: "198.51.100.2" });
    const list = (await errorList("open")).filter((g) => g.message.startsWith(marker));
    expect(list).toHaveLength(1);
    expect(list[0].count).toBe(2);
    expect(list[0].stats.touched).toBe(2);
    expect(list[0].stats.systems).toEqual([{ label: "iOS", n: 2 }]);
    expect(list[0].message).not.toMatch(/@|3f2b8c1e/);
    await db.update(schema.errorGroups).set({ status: "resolved", statusRelease: "ancienne" }).where(sql`id = ${list[0].id}`);
    await recordError({ ...report, message: `${marker} doc 1b2b8c1e-1d2a-4c3b-9e8f-0a1b2c3d4e5f pour e@f.fr`, ip: "198.51.100.1" });
    const detail = await errorDetail(list[0].id);
    expect(detail?.group.status).toBe("open");
    expect(detail?.group.regressedAt).not.toBeNull();
    expect(detail?.samples.length).toBe(3);
  });

  it("première visite du jour une seule fois, événements liés seulement avec accord, cohortes calculées", async () => {
    const yes = randomUUID();
    const no = randomUUID();
    await db.execute(sql`insert into users (id, email, name, password_hash, status, tracking_consent) values (${yes}, ${`${yes}@test.fr`}, 'Oui', 'x', 'active', 'yes'), (${no}, ${`${no}@test.fr`}, 'Non', 'x', 'active', 'no')`);
    expect(await recordVisit(yes)).toBe(true);
    expect(await recordVisit(yes)).toBe(false);
    await recordVisit(no);
    await trackEvent("quiz_done", { id: yes });
    await trackEvent("quiz_done", { id: no });
    const linked = await db.select().from(schema.productEvents).where(sql`user_id in (${yes}, ${no})`);
    expect(linked.map((e) => [e.userId, e.name]).sort()).toEqual([[yes, "daily_active"], [yes, "quiz_done"]].sort());
    await db.execute(sql`insert into product_events (user_id, name, at) values (${yes}, 'doc_read', now() - interval '20 days')`);
    const p = periodOf("30");
    const totals = await eventTotals(p);
    expect(totals.find((t) => t.name === "quiz_done")!.n).toBeGreaterThanOrEqual(2);
    expect(await consentedPeople(all, p)).toBeGreaterThanOrEqual(1);
    const cohorts = await eventCohorts(all, 8, p.current.to);
    const total = cohorts.days.reduce((a, r) => a + r.signed, 0);
    expect(total).toBeGreaterThanOrEqual(1);
    expect(cohorts.weeks[0].weeks).toHaveLength(8);
  });
});
