import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { browserOf, deviceOf, osOf } from "@/lib/analytics-utils";
import { parisDay } from "@/lib/audience-calc";
import { db, schema } from "@/lib/db";
import { currentRelease } from "@/lib/release";
import { keepSample } from "./limit";
import { errorName, fingerprintInput, LIMITS, scrubStack, scrubText } from "./scrub";

export type ErrorReport = {
  source: "server" | "client";
  name: unknown;
  message: unknown;
  stack: unknown;
  /** Route déjà réduite (routeOf, ou le fichier de route de Next côté serveur). */
  route: string;
  userAgent: string;
  /** Adresse du visiteur, seulement pour l'empreinte du jour ; jamais écrite. */
  ip: string;
};

// Sel du jour, tiré au hasard et gardé en mémoire seulement : l'empreinte d'hier ne se recalcule plus.
let salt = { day: "", key: Buffer.alloc(0) };
function reporterOf(ip: string, userAgent: string, now: Date) {
  const day = parisDay(now);
  if (salt.day !== day) salt = { day, key: randomBytes(32) };
  return createHmac("sha256", salt.key).update(`${ip}|${userAgent}`).digest("hex").slice(0, 16);
}

/** Nettoie, regroupe et compte une erreur ; garde un exemple tant que le plafond du jour n'est pas atteint. */
export async function recordError(report: ErrorReport, now = new Date()) {
  const name = errorName(report.name);
  const message = scrubText(report.message, LIMITS.message) || "(sans message)";
  const stack = scrubStack(report.stack);
  const route = scrubText(report.route, LIMITS.route);
  const release = currentRelease();
  const fingerprint = createHash("sha256").update(fingerprintInput(report.source, name, message, stack)).digest("hex");
  const g = schema.errorGroups;
  const fresh = sql`${g.windowStart} > now() - interval '1 hour'`;
  const reopen = sql`${g.status} = 'resolved' and coalesce(${g.statusRelease}, '') <> excluded.last_release`;
  const [group] = await db.insert(g).values({
    fingerprint, source: report.source, name, message, stack, route, count: 1, firstRelease: release, lastRelease: release, windowCount: 1,
  }).onConflictDoUpdate({
    target: g.fingerprint,
    set: {
      count: sql`${g.count} + 1`,
      lastSeen: sql`now()`,
      lastRelease: sql`excluded.last_release`,
      route: sql`excluded.route`,
      stack: sql`case when excluded.stack <> '' then excluded.stack else ${g.stack} end`,
      windowCount: sql`case when ${fresh} then ${g.windowCount} + 1 else 1 end`,
      windowStart: sql`case when ${fresh} then ${g.windowStart} else now() end`,
      regressedAt: sql`case when ${reopen} then now() else ${g.regressedAt} end`,
      status: sql`case when ${reopen} then 'open' else ${g.status} end`,
    },
  }).returning({ id: g.id });
  const e = schema.errorEvents;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(e)
    .where(and(eq(e.groupId, group.id), gte(e.at, new Date(now.getTime() - 86_400_000))));
  if (!keepSample(n)) return;
  await db.insert(e).values({
    groupId: group.id, release, route, message, stack,
    browser: browserOf(report.userAgent), os: osOf(report.userAgent), device: deviceOf(report.userAgent),
    reporter: report.ip || report.userAgent ? reporterOf(report.ip, report.userAgent, now) : "",
  });
}
