import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";
import sitemap from "@/app/sitemap";
import { sidebarGroups } from "@/components/nav/config";
import { WASM_PATHS } from "@/lib/csp";
import { HOME, homeOf, safeNext } from "@/lib/home";
import { INDEXABLE_PAGES, isIndexablePath } from "@/lib/indexable";
import { modesOf } from "@/lib/modes";
import { breadcrumbLd, organizationLd, websiteLd } from "@/lib/seo";
import { proxy } from "../src/proxy";

const BASE = "https://campuss.fr";
const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("« / » est la présentation, les cours vivent à /accueil", () => {
  beforeAll(() => { vi.stubEnv("BASE_URL", BASE); });
  afterAll(() => { vi.unstubAllEnvs(); });

  it("redirige l'ancienne /presentation vers « / » en 308, sans toucher à ses captures", async () => {
    const rules = await nextConfig.redirects!();
    const rule = rules.find((r) => r.source === "/presentation");
    expect(rule).toMatchObject({ destination: "/", permanent: true });
    // Règle exacte : /presentation/telephone-2/… et les captures restent servies telles quelles
    expect(rules.some((r) => r.source.startsWith("/presentation/"))).toBe(false);
  });

  it("met la présentation à « / » et l'accueil connecté à /accueil", () => {
    expect(HOME).toBe("/accueil");
    const landing = read("src/app/page.tsx");
    expect(landing).toContain('publicMetadata({ path: "/"');
    expect(landing).toContain('label: "Ouvrir Campuss"');
    expect(read("src/app/accueil/page.tsx")).toContain("requireUser()");
  });

  it("mène les anciens liens de l'accueil sous /accueil, sans redirection ouverte", () => {
    expect(homeOf("/")).toBe("/accueil");
    expect(homeOf("/?semestre=2")).toBe("/accueil?semestre=2");
    expect(homeOf("/#nouveautes")).toBe("/accueil#nouveautes");
    expect(homeOf("/matieres")).toBe("/matieres");
    expect(safeNext(undefined)).toBe("/accueil");
    expect(safeNext("/")).toBe("/accueil");
    expect(safeNext("/d/abc?x=1")).toBe("/d/abc?x=1");
    for (const hostile of ["//evil.example", "/\\evil.example", "https://evil.example", "/\nx", "", 42]) expect(safeNext(hostile)).toBe("/accueil");
  });

  it("rend « / » indexable et garde /accueil en noindex", () => {
    expect(INDEXABLE_PAGES[0].path).toBe("/");
    expect(isIndexablePath("/")).toBe(true);
    for (const p of ["/accueil", "/accueil/", "/presentation", "/presentation/x"]) expect(isIndexablePath(p), p).toBe(false);
    expect(sitemap().map((e) => e.url)).toContain(`${BASE}/`);
    expect(sitemap().map((e) => e.url)).not.toContain(`${BASE}/presentation`);
  });

  it("donne « / » comme adresse au JSON-LD", () => {
    expect(organizationLd().url).toBe(`${BASE}/`);
    expect(websiteLd().url).toBe(`${BASE}/`);
    expect(breadcrumbLd("/cgu", "Conditions").itemListElement[0].item).toBe(`${BASE}/`);
    expect(read("src/app/page.tsx")).not.toContain("/presentation#");
  });

  it("n'autorise le WebAssembly que sur la présentation, donc « / »", () => {
    expect(WASM_PATHS).toEqual(["/"]);
  });

  it("ne laisse jamais un cache partagé garder « / », connecté ou non", () => {
    for (const cookie of [undefined, "__Host-campus=jeton"]) {
      const response = proxy(new NextRequest(`${BASE}/`, cookie ? { headers: { cookie } } : undefined));
      expect(response.headers.get("Cache-Control")).toMatch(/^private, no-store/);
      expect(response.headers.get("Vary")).toContain("Cookie");
    }
  });

  it("fait pointer l'onglet Accueil, le logo, le raccourci G A et l'application installée vers /accueil", () => {
    expect(modesOf("member").find((m) => m.mode === "read")?.href).toBe("/accueil");
    const counts = { toReview: 0, pending: 0, reports: 0, invites: 0, friends: 0, dueCards: 0 };
    expect(sidebarGroups("read", "member", counts)[0].items.find((i) => i.label === "Accueil")?.href).toBe("/accueil");
    expect(read("src/components/command-palette.tsx")).toContain("{ a: HOME,");
    const manifest = JSON.parse(read("public/manifest.webmanifest"));
    expect(manifest.start_url).toBe("/accueil");
    // L'identité de l'application installée ne change pas
    expect(manifest.id).toBe("/");
    expect(read("public/sw.js")).not.toMatch(/url \|\| "\/"/);
  });
});
