import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

// Sur une base jetable seulement : DATABASE_URL=postgres://… npx vitest run tests/statistiques-db.test.ts
// Chaque requête des statistiques tourne sur une vraie base (syntaxe, paramètres, filtres) et ne renvoie que des totaux.
describe.skipIf(!process.env.DATABASE_URL)("statistiques d'administration, sur une vraie base", async () => {
  const { sql } = await import("drizzle-orm");
  const { db } = await import("@/lib/db");
  const q = await import("@/lib/audience-queries");
  const { periodOf, retentionTable } = await import("@/lib/audience-calc");
  const p = periodOf("30");
  const all = { programId: null, level: null, subjectId: null };
  const some = { programId: 1, level: 1, subjectId: 1 };

  it("compte un étudiant actif, revenu, qui a lu, révisé et publié", async () => {
    const id = randomUUID();
    const doc = randomUUID();
    const [program] = (await db.execute<{ id: number }>(sql`insert into programs (slug, name, active) values (${`t-${id.slice(0, 8)}`}, 'Test', true) returning id`)).rows;
    const [subject] = (await db.execute<{ id: number }>(sql`insert into subjects (program_id, level, name, short_name) values (${program.id}, 1, ${`Matière ${id.slice(0, 6)}`}, 'MT') returning id`)).rows;
    await db.execute(sql`insert into users (id, email, name, password_hash, status, program_id, level, created_at) values (${id}, ${`${id}@test.fr`}, 'T', 'x', 'active', ${program.id}, 1, now() - interval '20 days')`);
    await db.execute(sql`insert into documents (id, title, category, program_id, subject_id, created_by, published, published_at, review_requested_at) values (${doc}, 'Cours test', 'cours', ${program.id}, ${subject.id}, ${id}, true, now() - interval '2 days', now() - interval '3 days')`);
    await db.execute(sql`insert into reading_progress (user_id, document_id, percent, created_at, updated_at) values (${id}, ${doc}, 60, now() - interval '19 days', now() - interval '1 day')`);
    await db.execute(sql`insert into page_views (path, device, browser, user_id) values (${`/d/${doc}`}, 'Ordinateur', 'Firefox', ${id})`);
    await db.execute(sql`insert into audience_counters (day, kind, key, n, seconds) values (${p.current.to}, 'time', ${`/d/${doc}`}, 2, 300), (${p.current.to}, 'miss', 'cours introuvable', 3, 0) on conflict do nothing`);
    await db.execute(sql`insert into document_reviews (document_id, author_id, kind, created_at) values (${doc}, ${id}, 'sent', now() - interval '3 days'), (${doc}, ${id}, 'published', now() - interval '2 days')`);
    const mine = { programId: program.id, level: 1, subjectId: subject.id };

    const active = await q.activeSeries(mine, p);
    expect(active).toHaveLength(60);
    expect(active.at(-1)!.mau).toBe(1);
    expect(active.at(-1)!.dau).toBe(1);
    const docs = await q.topDocuments(mine, p);
    expect(docs[0]).toMatchObject({ id: doc, n: 1, readers: 1, completion: 60, seconds: 150 });
    expect((await q.searchMisses(p)).top.some((m) => m.label === "cours introuvable")).toBe(true);
    const funnel = await q.funnel(mine, p);
    expect(funnel.current).toMatchObject({ signed: 1, read: 1, published: 1 });
    const rows = await q.cohorts(mine, "week", 8, p.current.to);
    expect(rows.reduce((a, r) => a + r.signed, 0)).toBe(1);
    expect(rows.find((r) => r.signed)!.d7).toBe(1);
    expect(retentionTable(rows, p.current.to).average[1].rate).toBe(1);
    const contribution = await q.contributionTotals(mine, p);
    expect(contribution.sent[0]).toBe(1);
    expect(contribution.firstResponse[0]).toBeCloseTo(86_400, -2);
    expect((await q.subjectsActivity(mine, p))[0]).toMatchObject({ id: subject.id, views: 1, readers: 1, published: 1 });
  });

  it("toutes les requêtes passent, avec et sans filtres, sur 7 jours comme sur 12 mois", async () => {
    for (const f of [all, some]) {
      for (const period of [periodOf("7"), periodOf("365")]) {
        await Promise.all([
          q.activeSeries(f, period), q.traffic(f, period), q.viewsByDay(f, period), q.signupsByDay(f, period), q.reviewsByDay(f, period),
          q.contributionByDay(f, period, ["sent", "resubmitted"]), q.viewsBy("path", f, period), q.viewsBy("referrer", f, period),
          q.durations(["/", "/d/x"], period), q.timeTotals(period), q.topDocuments(f, period), q.subjectsActivity(f, period),
          q.searchMisses(period), q.revisionTotals(f, period), q.contributionTotals(f, period), q.cohorts(f, "month", 12, period.current.to),
          q.funnel(f, period), q.publishedTotals(f, period), q.filterChoices(f),
        ]);
      }
    }
  });

  it("n'expose jamais une recherche faite une seule fois", async () => {
    await db.execute(sql`insert into audience_counters (day, kind, key, n) values (${p.current.to}, 'miss', 'jean dupont', 1) on conflict do nothing`);
    expect((await q.searchMisses(p)).top.some((m) => m.label === "jean dupont")).toBe(false);
  });
});
