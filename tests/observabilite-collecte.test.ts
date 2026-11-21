import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { retentionTable, weeklyRetention } from "@/lib/audience-calc";
import { alertReason, alertText } from "@/lib/errors/alert";
import { keepSample, reopens, SAMPLES_PER_DAY, shouldSend, SPIKE_PER_HOUR, takeSlot, PAGE_MAX } from "@/lib/errors/limit";
import { reportBody } from "@/lib/errors/client";
import { fingerprintInput, isNoise, normalizeFrames, routeOf, scrubStack, scrubText } from "@/lib/errors/scrub";
import { consentOf, eventWrites, isProductEvent, PRODUCT_EVENT_NAMES, RETENTION } from "@/lib/product-event-catalog";

/* Base simulée : on regarde ce qui serait écrit, rien d'autre */
const written = vi.hoisted(() => ({ tables: [] as string[], values: [] as Record<string, unknown>[], cookie: undefined as string | undefined, account: null as string | null }));
const recorded = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("@/lib/errors/record", () => ({ recordError: async (r: Record<string, unknown>) => { recorded.push(r); } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (written.cookie ? { value: written.cookie } : undefined) }) }));
vi.mock("@/lib/db", async () => {
  const { getTableConfig } = await import("drizzle-orm/pg-core");
  const schema = await import("@/lib/db/schema");
  const db = {
    insert: (table: Parameters<typeof getTableConfig>[0]) => ({
      values: (v: Record<string, unknown>) => {
        written.tables.push(getTableConfig(table).name);
        written.values.push(v);
        const done = Promise.resolve();
        return Object.assign(done, { onConflictDoUpdate: () => Promise.resolve() });
      },
    }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ consent: written.account }] }) }) }),
  };
  return { db, schema };
});

describe("nettoyage des données sensibles", () => {
  it("retire adresses mail, jetons, mots de passe, cookies et en-têtes d'autorisation", () => {
    const raw = `Échec pour jeanne.dupont@etu.exemple.fr (jeanne%40etu.exemple.fr) password=hunter2 token: "abc" Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig Cookie: __Host-campus=s3cr3t; x=1`;
    const out = scrubText(raw);
    for (const leak of ["jeanne", "etu.exemple.fr", "hunter2", "eyJ", "s3cr3t", "\"abc\""]) expect(out).not.toContain(leak);
    expect(out).toContain("[adresse]");
    expect(out).toContain("password=[masqué]");
  });

  it("retire la partie requête et le fragment des adresses, les jetons longs, les UUID, les IP et les numéros", () => {
    const out = scrubText("GET https://campuss.fr/reset?token=Zx81kQ#frag et /d/abc?q=partiel depuis 192.168.1.20 ou 2001:db8:0:0:0:0:2:1, tel 06 12 34 56 78, doc 3f2b8c1e-1d2a-4c3b-9e8f-0a1b2c3d4e5f, clé a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8");
    expect(out).toContain("https://campuss.fr/reset");
    for (const leak of ["Zx81kQ", "frag", "partiel", "192.168", "2001:db8", "06 12", "3f2b8c1e", "a1b2c3d4e5f6"]) expect(out).not.toContain(leak);
  });

  it("ne garde aucune valeur d'une requête SQL", () => {
    const out = scrubText("Failed query: select * from users where email = $1\nparams: alice@exemple.fr,42");
    expect(out).toContain("params: [masqué]");
    expect(out).not.toContain("alice");
  });

  it("borne la longueur et retire les caractères de contrôle", () => {
    expect(scrubText("a".repeat(5000)).length).toBe(500);
    expect(scrubText("x\u0000y\u001bz")).toBe("xyz");
  });

  it("nettoie la pile : lignes de pile seulement, chemins du serveur retirés, extensions écartées, 25 lignes au plus", () => {
    const stack = [
      "TypeError: x is undefined, pour bob@exemple.fr",
      "    at load (/app/.next/server/chunks/ssr/src_lib_course_ts.js:12:5)",
      "    at render (https://campuss.fr/_next/static/chunks/app/page-3f9a8b7c6d5e4f3a.js?v=secret:1:200)",
      "    at inject (chrome-extension://abcdef/content.js:1:1)",
      ...Array.from({ length: 40 }, (_, i) => `    at f${i} (/srv/app-exemple/src/x.ts:${i}:1)`),
    ].join("\n");
    const out = scrubStack(stack);
    expect(out).not.toContain("bob@");
    expect(out).not.toContain("/app/.next");
    expect(out).toContain("page-3f9a8b7c6d5e4f3a.js:1:200");
    expect(out).not.toContain("TypeError");
    expect(out).not.toContain("/srv/app-exemple");
    expect(out).not.toContain("campuss.fr");
    expect(out).not.toContain("secret");
    expect(out).not.toContain("chrome-extension");
    expect(out.split("\n").length).toBeLessThanOrEqual(25);
  });

  it("réduit une adresse à sa route, sans identifiant ni jeton", () => {
    expect(routeOf("/d/3f2b8c1e-1d2a-4c3b-9e8f-0a1b2c3d4e5f?q=x#y")).toBe("/d/[id]");
    expect(routeOf("/matieres/42")).toBe("/matieres/[n]");
    expect(routeOf("/reset/AbCdEf0123456789")).toBe("/reset/[jeton]");
    expect(routeOf("/u/jean.dupont@x.fr")).toBe("/u/[x]");
    expect(routeOf("https://evil.example/")).toBe("");
  });

  it("le navigateur envoie un corps déjà nettoyé, sans partie requête", () => {
    const err = new TypeError("échec pour alice@exemple.fr");
    const body = reportBody("error", err, "/reviser?token=abc");
    expect(body.message).toBe("échec pour [adresse]");
    expect(body.path).toBe("/reviser");
    expect(body.name).toBe("TypeError");
  });

  it("écarte le bruit du navigateur", () => {
    expect(isNoise("Script error.", "")).toBe(true);
    expect(isNoise("ResizeObserver loop completed with undelivered notifications.", "")).toBe(true);
    expect(isNoise("x", "at a (moz-extension://abc/x.js:1:1)")).toBe(true);
    expect(isNoise("x is not a function", "")).toBe(false);
    // Une redirection d'action serveur (déconnexion depuis /moi) remontait comme une erreur du navigateur
    expect(isNoise("NEXT_REDIRECT", "at o (/_next/static/chunks/a.js:1:2)")).toBe(true);
    expect(isNoise("NEXT_HTTP_ERROR_FALLBACK;404", "")).toBe(true);
    expect(isNoise("NEXT_REDIRECTION manquée", "")).toBe(false);
  });
});

describe("empreinte et regroupement", () => {
  const stack = (line: number, hash: string) => `at render (/_next/static/chunks/app/page-${hash}.js:${line}:9)\nat x (/_next/static/chunks/react-dom-0a1b2c3d4e.js:1:1)\nat load (src/lib/course.ts:${line}:2)`;

  it("deux occurrences qui ne diffèrent que par un identifiant, un nombre ou un build tombent dans le même groupe", () => {
    const a = fingerprintInput("client", "TypeError", scrubText("Cannot read 'title' of document 3f2b8c1e-1d2a-4c3b-9e8f-0a1b2c3d4e5f (12 essais)"), stack(10, "3f9a8b7c6d"));
    const b = fingerprintInput("client", "TypeError", scrubText("Cannot read 'slug' of document 9a9b8c1e-1d2a-4c3b-9e8f-0a1b2c3d4e5f (3 essais)"), stack(99, "77aa88bb99"));
    expect(a).toBe(b);
  });

  it("type, source ou fichier différents font des groupes différents", () => {
    const base = fingerprintInput("client", "TypeError", "x is undefined", stack(1, "aaaaaaaa"));
    expect(fingerprintInput("client", "RangeError", "x is undefined", stack(1, "aaaaaaaa"))).not.toBe(base);
    expect(fingerprintInput("server", "TypeError", "x is undefined", stack(1, "aaaaaaaa"))).not.toBe(base);
    expect(fingerprintInput("client", "TypeError", "x is undefined", "at y (src/lib/other.ts:1:1)")).not.toBe(base);
  });

  it("ne retient que les fichiers du site, sans React ni Next", () => {
    expect(normalizeFrames(stack(1, "abcdef12"))).toEqual(["page", "course"]);
  });
});

describe("limite de débit et échantillonnage", () => {
  it("une fenêtre glissante par clé", () => {
    const w = new Map<string, number[]>();
    for (let i = 0; i < 10; i++) expect(takeSlot(w, "1.2.3.4", 10, 60_000, 1000 + i)).toBe(true);
    expect(takeSlot(w, "1.2.3.4", 10, 60_000, 2000)).toBe(false);
    expect(takeSlot(w, "5.6.7.8", 10, 60_000, 2000)).toBe(true);
    expect(takeSlot(w, "1.2.3.4", 10, 60_000, 62_000)).toBe(true);
  });

  it("oublie tout plutôt que de grossir sans fin", () => {
    const w = new Map<string, number[]>();
    for (let i = 0; i < 5; i++) takeSlot(w, `k${i}`, 1, 60_000, 0, 5);
    takeSlot(w, "nouvelle", 1, 60_000, 0, 5);
    expect(w.size).toBe(1);
  });

  it("une même erreur une fois par page, 5 au plus, et le tirage au sort décide", () => {
    const seen = new Set<string>();
    expect(shouldSend(seen, "a", 1, 0.5)).toBe(true);
    expect(shouldSend(seen, "a", 1, 0.5)).toBe(false);
    for (let i = 0; i < 10; i++) shouldSend(seen, `k${i}`, 1, 0);
    expect(seen.size).toBe(PAGE_MAX);
    expect(shouldSend(new Set(), "b", 0.1, 0.5)).toBe(false);
  });

  it("garde les exemples jusqu'au plafond du jour seulement", () => {
    expect(keepSample(0)).toBe(true);
    expect(keepSample(SAMPLES_PER_DAY - 1)).toBe(true);
    expect(keepSample(SAMPLES_PER_DAY)).toBe(false);
  });

  it("la route du navigateur applique les limites et ne lit ni cookie ni session", () => {
    const route = readFileSync("src/app/api/errors/route.ts", "utf8");
    expect(route).toMatch(/takeSlot\(perIp/);
    expect(route).toMatch(/takeSlot\(site/);
    expect(route).toMatch(/maxBodyBytes/);
    expect(route).not.toMatch(/cookies\(|currentUser|loadSession|campuss-visitor/);
  });
});

describe("route /api/errors", () => {
  const send = async (ip: string, body: unknown, extra: Record<string, string> = {}) => {
    const { POST } = await import("@/app/api/errors/route");
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return POST(new Request("https://campuss.fr/api/errors", { method: "POST", body: text, headers: { "content-type": "application/json", "content-length": String(text.length), "user-agent": "Mozilla/5.0 (iPhone) Safari/605.1", "x-forwarded-for": ip, cookie: "__Host-campus=secret", ...extra } }));
  };
  const report = { kind: "error", name: "TypeError", message: "x is undefined", stack: "", path: "/d/3f2b8c1e-1d2a-4c3b-9e8f-0a1b2c3d4e5f?token=abc" };

  it("enregistre une erreur réduite, sans cookie ni adresse dans la route", async () => {
    recorded.length = 0;
    const response = await send("192.0.2.1", report);
    expect(response.status).toBe(204);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ source: "client", route: "/d/[id]" });
    expect(JSON.stringify(recorded[0])).not.toContain("secret");
  });

  it("10 envois par minute et par adresse, puis plus rien (même réponse)", async () => {
    recorded.length = 0;
    for (let i = 0; i < 15; i++) expect((await send("192.0.2.2", { ...report, message: `e${i}` })).status).toBe(204);
    expect(recorded).toHaveLength(10);
  });

  it("refuse un corps trop gros, mal formé ou avec des champs inconnus, sans le dire", async () => {
    recorded.length = 0;
    expect((await send("192.0.2.3", { ...report, stack: "x".repeat(20_000) })).status).toBe(204);
    expect((await send("192.0.2.4", "{pas du json")).status).toBe(204);
    expect((await send("192.0.2.5", { ...report, email: "a@b.fr" })).status).toBe(204);
    expect((await send("192.0.2.6", report, { "user-agent": "curl/8" })).status).toBe(204);
    expect(recorded).toHaveLength(0);
  });
});

describe("statut et alertes", () => {
  it("une erreur résolue se rouvre seulement dans une autre version", () => {
    expect(reopens("resolved", "abc123", "abc123")).toBe(false);
    expect(reopens("resolved", "abc123", "def456")).toBe(true);
    expect(reopens("ignored", "abc123", "def456")).toBe(false);
    expect(reopens("open", null, "def456")).toBe(false);
  });

  it("prévient pour une nouvelle erreur, une erreur revenue ou un pic", () => {
    const base = { id: 1, name: "TypeError", message: "x", count: 3, windowCount: 1, alertedAt: new Date("2026-11-20T10:00:00Z"), regressedAt: null };
    expect(alertReason({ ...base, alertedAt: null })).toBe("new");
    expect(alertReason({ ...base, regressedAt: new Date("2026-11-21T10:00:00Z") })).toBe("back");
    expect(alertReason({ ...base, windowCount: SPIKE_PER_HOUR })).toBe("spike");
    expect(alertReason(base)).toBeNull();
    expect(alertText([{ ...base, reason: "spike", windowCount: 80 }])).toContain("80 dans l’heure");
  });

  it("l'alerte passe par les mails regroupés, une par heure au plus", () => {
    const source = readFileSync("src/lib/errors/alert.ts", "utf8");
    expect(source).toMatch(/rateLimited\(key, 1, 60\)/);
    expect(source).not.toMatch(/batch: false/);
  });
});

describe("consentement : pas d'identifiant sans accord", () => {
  beforeEach(() => {
    written.tables = []; written.values = []; written.cookie = undefined; written.account = null;
  });

  it("le choix du compte prime, puis celui du cookie ; seul « yes » autorise le lien", () => {
    expect(consentOf("yes", "no")).toBe(true);
    expect(consentOf("no", "yes")).toBe(false);
    expect(consentOf(null, "yes")).toBe(true);
    expect(consentOf(null, undefined)).toBe(false);
    expect(eventWrites("quiz_done", "u1", false)).toEqual({ daily: { name: "quiz_done" }, individual: null });
    expect(eventWrites("quiz_done", null, true).individual).toBeNull();
    expect(eventWrites("quiz_done", "u1", true).individual).toEqual({ name: "quiz_done", userId: "u1" });
  });

  it("sans accord, seul le total du jour s'écrit, sans aucun identifiant", async () => {
    const { trackEvent } = await import("@/lib/product-events");
    await trackEvent("card_created", { id: "11111111-1111-4111-8111-111111111111", trackingConsent: "no" });
    written.cookie = "yes";
    await trackEvent("quiz_done", { id: "11111111-1111-4111-8111-111111111111", trackingConsent: "no" });
    expect(written.tables).toEqual(["product_event_counts", "product_event_counts"]);
    expect(JSON.stringify(written.values)).not.toContain("1111");
  });

  it("avec accord (compte, ou cookie à défaut), l'événement est aussi lié à la personne", async () => {
    const { trackEvent } = await import("@/lib/product-events");
    await trackEvent("doc_read", { id: "22222222-2222-4222-8222-222222222222", trackingConsent: "yes" });
    written.cookie = "yes";
    await trackEvent("signup", { id: "33333333-3333-4333-8333-333333333333", trackingConsent: null });
    expect(written.tables).toEqual(["product_event_counts", "product_events", "product_event_counts", "product_events"]);
    expect(written.values[1]).toEqual({ name: "doc_read", userId: "22222222-2222-4222-8222-222222222222" });
  });

  it("le retrait de l'accord efface les événements liés, et l'export les restitue", () => {
    expect(readFileSync("src/app/api/consent/route.ts", "utf8")).toMatch(/delete\(schema\.productEvents\)/);
    expect(readFileSync("src/app/api/account/export/route.ts", "utf8")).toMatch(/productEvents: await db\.select/);
  });

  it("un catalogue fermé et des durées annoncées", () => {
    expect(isProductEvent("quiz_done")).toBe(true);
    expect(isProductEvent("toString")).toBe(false);
    expect(PRODUCT_EVENT_NAMES.length).toBeLessThanOrEqual(12);
    expect(RETENTION).toEqual({ errorDays: 90, individualEventDays: 396, dailyEventDays: 760 });
    const boot = readFileSync("src/lib/boot.ts", "utf8");
    for (const table of ["errorEvents", "errorGroups", "productEvents", "productEventCounts"]) expect(boot).toContain(`schema.${table}`);
    const policy = readFileSync("src/app/confidentialite/page.tsx", "utf8");
    expect(policy).toContain("Erreurs techniques du site");
    expect(policy).toContain("13 mois");
  });
});

describe("calcul de la rétention", () => {
  it("par semaine : taux de chaque cohorte, case vide tant que la semaine n'est pas finie", () => {
    const rows = [
      { cohort: "2026-09-07", signed: 10, weeks: [6, 4, 3, 2, 2, 1, 1, 1] },
      { cohort: "2026-11-09", signed: 4, weeks: [1, 0, 0, 0, 0, 0, 0, 0] },
    ];
    const { lines, average } = weeklyRetention(rows, "2026-11-21");
    expect(lines[0].cells.map((c) => c.rate)).toEqual([0.6, 0.4, 0.3, 0.2, 0.2, 0.1, 0.1, 0.1]);
    // Cohorte du 9 novembre : dernier arrivé le 15, sa semaine 1 finit le 28 novembre
    expect(lines[1].cells.every((c) => c.rate === null)).toBe(true);
    expect(average[0]).toEqual({ k: 1, n: 6, rate: 0.6 });
  });

  it("moyenne pondérée par la taille des cohortes mûres", () => {
    const rows = [
      { cohort: "2026-08-03", signed: 10, weeks: [5, 0, 0, 0, 0, 0, 0, 0] },
      { cohort: "2026-08-10", signed: 30, weeks: [9, 0, 0, 0, 0, 0, 0, 0] },
    ];
    expect(weeklyRetention(rows, "2026-11-21").average[0].rate).toBeCloseTo(14 / 40);
  });

  it("J+1, J+7, J+30 : le calcul existant sert tel quel aux cohortes d'événements", () => {
    const { lines } = retentionTable([{ cohort: "2026-11-02", signed: 5, d1: 4, d7: 2, d30: 0 }], "2026-11-21", "week");
    expect(lines[0].cells.map((c) => c.rate)).toEqual([0.8, 0.4, null]);
  });
});
