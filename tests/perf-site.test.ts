import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { addDays, dayRange, rollingActive } from "@/lib/audience-calc";
import { criticalFontUrls, forgetCriticalFonts } from "@/lib/font-preload";

describe("actifs glissants des statistiques (rollingActive)", () => {
  // Référence : la définition de l'ancienne requête (trois sous-requêtes par jour)
  const naive = (byDay: Map<string, number[]>, days: string[]) => days.map((day) => {
    const window = (width: number) => new Set(Array.from({ length: width }, (_, i) => byDay.get(addDays(day, -i)) ?? []).flat()).size;
    return { day, dau: byDay.get(day)?.length ?? 0, wau: window(7), mau: window(30) };
  });

  it("donne les mêmes actifs du jour, sur 7 et sur 30 jours que le calcul jour par jour", () => {
    const days = dayRange({ from: "2026-09-17", to: "2026-11-15" });
    const byDay = new Map<string, number[]>();
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (const day of dayRange({ from: addDays(days[0], -29), to: days.at(-1)! })) {
      if (rand() < 0.2) continue; // des jours sans personne
      byDay.set(day, [...new Set(Array.from({ length: Math.floor(rand() * 25) }, () => Math.floor(rand() * 60)))]);
    }
    expect(rollingActive(byDay, days)).toEqual(naive(byDay, days));
  });

  it("compte une personne une seule fois dans une fenêtre, et l'oublie quand elle en sort", () => {
    const byDay = new Map([["2026-11-01", [1]], ["2026-11-03", [1, 2]]]);
    const days = dayRange({ from: "2026-11-01", to: "2026-11-10" });
    const rows = rollingActive(byDay, days);
    expect(rows[0]).toEqual({ day: "2026-11-01", dau: 1, wau: 1, mau: 1 });
    expect(rows[2]).toEqual({ day: "2026-11-03", dau: 2, wau: 2, mau: 2 });
    expect(rows.find((r) => r.day === "2026-11-08")).toMatchObject({ wau: 2 });
    expect(rows.find((r) => r.day === "2026-11-10")).toMatchObject({ dau: 0, wau: 0, mau: 2 });
    expect(rollingActive(byDay, [])).toEqual([]);
  });
});

describe("préchargement des polices critiques", () => {
  let dir = "";
  afterEach(() => { forgetCriticalFonts(); if (dir) rmSync(dir, { recursive: true, force: true }); });

  it("précharge Massilia et Source Sans 3 latin droit avec leur adresse hachée, rien d'autre", () => {
    dir = mkdtempSync(join(tmpdir(), "polices-"));
    for (const f of ["massilia-vf.0kei8w359whee.woff2", "source-sans-3-latin-wght-normal.319-552wy8l00.woff2", "source-sans-3-latin-wght-italic.1a.woff2", "opendyslexic.2b.woff2", "KaTeX_Main-Regular.3c.woff2"]) writeFileSync(join(dir, f), "");
    expect(criticalFontUrls(dir)).toEqual(["/_next/static/media/massilia-vf.0kei8w359whee.woff2", "/_next/static/media/source-sans-3-latin-wght-normal.319-552wy8l00.woff2"]);
  });

  it("ne précharge rien sans dossier de build", () => {
    expect(criticalFontUrls("/nulle/part")).toEqual([]);
  });
});

describe("en-têtes de cache des fichiers publics", () => {
  const rules = async () => (await nextConfig.headers!()).filter((r) => r.headers.some((h) => h.key === "Cache-Control"));
  const match = (source: string, path: string) => {
    // Assez du langage de chemins de Next pour ces règles : :x+ (au moins un segment), :x* (zéro ou plus), :x(a|b), :x
    const re = source
      .replace(/:\w+\(([^)]+)\)/g, "($1)")
      .replace(/\/:\w+\+/g, "/[^]+")
      .replace(/\/:\w+\*/g, "(?:/[^]*)?")
      .replace(/:\w+/g, "[^/]+");
    return new RegExp(`^${re}$`).test(path);
  };
  const cacheOf = async (path: string) => (await rules()).filter((r) => match(r.source, path)).flatMap((r) => r.headers.filter((h) => h.key === "Cache-Control").map((h) => h.value)).at(-1);

  it("ne met jamais en cache la page de présentation ni une page", async () => {
    for (const path of ["/presentation", "/", "/accueil", "/d/abc", "/parametres", "/admin/statistiques"]) expect(await cacheOf(path), path).toBeUndefined();
  });

  it("garde le modèle 3D versionné un an, les captures un jour", async () => {
    expect(await cacheOf("/presentation/telephone-2/telephone.bin")).toBe("public, max-age=31536000, immutable");
    expect(await cacheOf("/presentation/ordi-accueil-light.avif")).toBe("public, max-age=86400, stale-while-revalidate=604800");
    expect(await cacheOf("/og.png")).toBe("public, max-age=86400, stale-while-revalidate=604800");
    expect(await cacheOf("/sw.js")).toBeUndefined();
  });
});
