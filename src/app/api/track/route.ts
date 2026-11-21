import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { browserOf, deviceOf, isBot, normalizePath, referrerHost } from "@/lib/analytics-utils";
import { missQuery, parisDay, viewSeconds } from "@/lib/audience-calc";
import { currentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { isDemo } from "@/lib/demo";
import { env } from "@/lib/env";
import { json } from "@/lib/http";
import { visitorAddress } from "@/lib/visitor";

// Limite simple en mémoire : ces mesures n'ont aucun besoin d'être exactes pour un client trop bavard
const recent = new Map<string, number[]>();

/**
 * Sans consentement : un compteur anonyme, sans cookie ni adresse IP.
 * Avec consentement : la visite est reliée à un identifiant de visiteur et au compte connecté.
 */
export async function POST(request: Request) {
  // Démonstration : aucune mesure d'audience, même interne
  if (isDemo()) return json({ ok: true });
  const agent = request.headers.get("user-agent") ?? "";
  if (isBot(agent)) return json({ ok: true });
  const ip = visitorAddress((name) => request.headers.get(name), env.trustedIpHeader);
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= 60) return json({ ok: true });
  recent.set(ip, [...hits, now]);
  if (recent.size > 5000) recent.clear();

  const body = await request.json().catch(() => null) as { path?: unknown; referrer?: unknown; kind?: unknown; seconds?: unknown; more?: unknown; query?: unknown } | null;
  const store = await cookies();
  const user = await currentUser();
  // Le choix fait sur le compte prime : il suit la personne d'un appareil à l'autre
  const consented = (user?.trackingConsent ?? store.get("campuss-consent")?.value) === "yes";
  if (body?.kind === "time" || body?.kind === "miss") {
    if (consented) await count(body);
    return json({ ok: true });
  }
  const path = normalizePath(body?.path);
  if (!path) return json({ ok: true });

  let visitorId: string | null = null;
  let userId: string | null = null;
  if (consented) {
    visitorId = store.get("campuss-visitor")?.value ?? null;
    if (!visitorId || !/^[0-9a-f-]{36}$/.test(visitorId)) {
      visitorId = randomUUID();
      store.set("campuss-visitor", visitorId, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 396 * 86_400 });
    }
    userId = user?.id ?? null;
  }
  await db.insert(schema.pageViews).values({
    path, device: deviceOf(agent), browser: browserOf(agent), referrer: referrerHost(body?.referrer, new URL(env.baseUrl).hostname), visitorId, userId,
  });
  return json({ ok: true });
}

/**
 * Durée de lecture et recherche sans résultat : avec accord seulement, et réduites à des totaux du jour sans identifiant
 * (ni compte, ni visiteur, ni adresse IP). `more` : suite d'une vue déjà comptée (onglet revenu au premier plan).
 */
async function count(body: { kind?: unknown; path?: unknown; seconds?: unknown; more?: unknown; query?: unknown }) {
  const { audienceCounters: t } = schema;
  const day = parisDay(new Date());
  const row = body.kind === "time"
    ? (() => { const path = normalizePath(body.path); const seconds = viewSeconds(body.seconds); return path && seconds ? { key: path, n: body.more === true ? 0 : 1, seconds } : null; })()
    : (() => { const key = missQuery(body.query); return key ? { key, n: 1, seconds: 0 } : null; })();
  if (!row) return;
  await db.insert(t).values({ day, kind: body.kind as "time" | "miss", ...row })
    .onConflictDoUpdate({ target: [t.day, t.kind, t.key], set: { n: sql`${t.n} + excluded.n`, seconds: sql`least(${t.seconds}::bigint + excluded.seconds, 2000000000)::int` } })
    .catch(() => undefined);
}
