import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { INDEXABLE_PAGES } from "@/lib/indexable";
import { llmsFullText, llmsText } from "@/lib/llms";
import { breadcrumbLd, publicMetadata } from "@/lib/seo";

const aiOn = vi.hoisted(() => ({ value: true as boolean | Error }));
vi.mock("@/lib/ai-available", () => ({
  aiAvailable: async () => {
    if (aiOn.value instanceof Error) throw aiOn.value;
    return aiOn.value;
  },
}));

const BASE = "https://campuss.fr";
vi.stubEnv("BASE_URL", BASE);
const PUBLIC = INDEXABLE_PAGES.map((p) => p.path);
const PRIVATE = [
  "/accueil", "/accueil/", "/presentation", "/d/abc", "/d/abc/edit", "/p/jeton-de-partage", "/content/doc/index.html", "/view/jeton/index.html", "/files/1",
  "/matieres", "/reviser", "/parametres", "/moi", "/u/quelqu-un", "/amis", "/admin", "/admin/personnes/1", "/moderation",
  "/enseignant", "/login", "/register", "/contact/suivi/jeton", "/actualites", "/api/health", "/presentationx",
  "/presentation/", "/cgu/x", "/llms.txt", "/llms-full.txt", "/sitemap.xml",
];

describe("robots.txt", () => {
  it("laisse explorer tout le site, pour que les robots lisent le noindex, et annonce le plan du site", () => {
    const r = robots();
    const rules = [r.rules].flat();
    expect(rules).toEqual([{ userAgent: "*", allow: "/" }]);
    expect(rules.some((rule) => "disallow" in rule)).toBe(false);
    expect(r.sitemap).toBe(`${BASE}/sitemap.xml`);
  });
});

describe("sitemap.xml", () => {
  it("ne liste que les pages publiques, en adresses absolues avec leur version française", () => {
    const entries = sitemap();
    expect(entries.map((e) => e.url)).toEqual(PUBLIC.map((p) => `${BASE}${p}`));
    for (const entry of entries) expect(entry.alternates?.languages).toEqual({ fr: entry.url });
    expect(PUBLIC).toEqual(expect.arrayContaining(["/", "/cgu", "/confidentialite", "/credits"]));
  });
});

describe("X-Robots-Tag", () => {
  const rule = async () => {
    const rules = (await nextConfig.headers!()).filter((r) => r.headers.some((h) => h.key === "X-Robots-Tag"));
    expect(rules).toHaveLength(1);
    return rules[0];
  };
  const noindexed = async (path: string) => {
    const { source } = await rule();
    // Seule forme utilisée : /:path(<expression>)
    const inner = /^\/:path\((.*)\)$/.exec(source)?.[1];
    if (!inner) throw new Error(`Règle inattendue : ${source}`);
    return new RegExp(`^/(?:${inner})$`).test(path);
  };

  it("met hors des moteurs toute adresse privée : cours, partages, contenus, pages connectées, administration", async () => {
    expect((await rule()).headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
    for (const path of PRIVATE) expect(await noindexed(path), path).toBe(true);
  });

  it("laisse indexer les pages publiques et l'image de partage, et rien d'autre", async () => {
    for (const path of [...PUBLIC, "/og.png"]) expect(await noindexed(path), path).toBe(false);
    expect(await noindexed("/ogxpng")).toBe(true);
  });
});

describe("métadonnées robots des pages", () => {
  const appDir = join(process.cwd(), "src", "app");
  const pages = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return pages(full);
    return e.name === "page.tsx" ? [full] : [];
  });
  const routeOf = (file: string) => `/${relative(appDir, file).split(sep).slice(0, -1).filter((s) => !/^\(.*\)$/.test(s)).join("/")}`;

  it("garde le noindex par défaut dans le layout racine", () => {
    expect(readFileSync(join(appDir, "layout.tsx"), "utf8")).toContain("robots: { index: false, follow: false }");
  });

  it("ne lève le noindex que sur les pages publiques, chacune avec sa propre adresse canonique", () => {
    const opened = pages(appDir).filter((file) => /publicMetadata\(|index:\s*true/.test(readFileSync(file, "utf8")));
    expect(opened.map(routeOf).sort()).toEqual([...PUBLIC].sort());
    for (const file of opened) expect(readFileSync(file, "utf8"), file).toContain(`publicMetadata({ path: "${routeOf(file)}"`);
  });

  it("garde le partage /p/[jeton] explicitement hors des moteurs", () => {
    expect(readFileSync(join(appDir, "p", "[token]", "page.tsx"), "utf8")).toContain("robots: { index: false, follow: false }");
  });

  it("donne à une page publique canonical, hreflang fr, aperçu OpenGraph et Twitter", () => {
    const meta = publicMetadata({ path: "/cgu", title: "Conditions d’utilisation", description: "Les règles." });
    expect(meta.robots).toEqual({ index: true, follow: true });
    expect(meta.alternates).toEqual({ canonical: "/cgu", languages: { fr: "/cgu", "x-default": "/cgu" } });
    expect(meta.openGraph).toMatchObject({ url: "/cgu", locale: "fr_FR", title: "Conditions d’utilisation – Campuss", images: [{ url: "/og.png", width: 1200, height: 630 }] });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", images: ["/og.png"] });
    expect(breadcrumbLd("/cgu", "Conditions d’utilisation").itemListElement.map((i) => i.item)).toEqual([`${BASE}/`, `${BASE}/cgu`]);
  });
});

describe("llms.txt", () => {
  const forbidden = [/10\.\d+\.\d+\.\d+/, /100\.\d+\.\d+\.\d+/, /Amazon|\bSES\b|Cloudflare|Traefik|MinIO|Docker|PostgreSQL|restic/, /@[a-z0-9-]+\.[a-z]{2,}/i, /\/(d|p|admin|content|view|files)\//];

  const org = { name: "l’UFR Lettres de Exempleville", short: "UFR Lettres · Exempleville", city: "Exempleville", university: "l’Université d’Exemple" };

  it("suit le format llmstxt.org : titre, résumé, faits, puis listes de liens sous des titres de niveau 2", () => {
    const text = llmsText({ baseUrl: BASE, ai: true, org });
    const lines = text.split("\n");
    expect(lines[0]).toBe("# Campuss");
    expect(lines[2]).toMatch(/^> Campuss est un site web gratuit/);
    expect(text).toContain("étudiants de licence de l’UFR Lettres de Exempleville (Université d’Exemple)");
    expect(text).toContain("open source");
    expect(text).toContain("sans lien officiel avec l’Université d’Exemple");
    expect(lines.filter((l) => l.startsWith("#")).map((l) => l.split(" ")[0])).toEqual(["#", "##", "##"]);
    const links = [...text.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
    expect(links).toEqual([...PUBLIC.map((p) => `${BASE}${p}`), `${BASE}/llms-full.txt`]);
  });

  it("reste juste sans établissement configuré", () => {
    const text = llmsFullText({ baseUrl: BASE, ai: true });
    expect(text).toContain("> Campuss est un site web gratuit, sans publicité, où les étudiants partagent leurs cours");
    expect(text).toContain("sans lien officiel avec l’université.");
    expect(text).not.toMatch(/ de \(| de ,|undefined/);
  });

  it("ne parle de Campuss IA que si elle est disponible", () => {
    expect(llmsText({ baseUrl: BASE, ai: true })).toContain("Campuss IA");
    expect(llmsText({ baseUrl: BASE, ai: false })).not.toContain("Campuss IA");
    expect(llmsFullText({ baseUrl: BASE, ai: false })).not.toContain("Campuss IA");
  });

  it("ne publie ni adresse interne, ni prestataire d'infrastructure, ni adresse mail, ni lien privé", () => {
    for (const text of [llmsText({ baseUrl: BASE, ai: true }), llmsFullText({ baseUrl: BASE, ai: true })]) {
      for (const re of forbidden) expect(text, String(re)).not.toMatch(re);
    }
  });

  it("donne la version longue avec la FAQ", () => {
    const text = llmsFullText({ baseUrl: BASE, ai: true });
    expect(text).toContain("## Questions fréquentes");
    expect(text).toContain("### Qu’est-ce que Campuss ?");
    expect(text).toContain("### C’est lié à l’université ?");
  });

  it("est servi en texte brut UTF-8, même si la base ne répond pas", async () => {
    const { GET } = await import("@/app/llms.txt/route");
    const { GET: full } = await import("@/app/llms-full.txt/route");
    const res = await GET();
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toContain("Campuss IA");
    expect((await full()).headers.get("content-type")).toBe("text/plain; charset=utf-8");
    aiOn.value = new Error("base indisponible");
    const down = await GET();
    expect(down.status).toBe(200);
    expect(await down.text()).not.toContain("Campuss IA");
    aiOn.value = true;
  });
});

describe("proxy : noindex sur toute adresse non publique", () => {
  it("isIndexablePath n'accepte que les pages publiques et og.png", async () => {
    const { isIndexablePath } = await import("../src/lib/indexable");
    for (const p of ["/", "/cgu", "/confidentialite", "/credits", "/contact", "/og.png"]) expect(isIndexablePath(p)).toBe(true);
    for (const p of ["/accueil", "/presentation", "/matieres", "/p/jeton-inconnu", "/d/abc", "/presentation/x", "/admin", "/llms.txt"]) expect(isIndexablePath(p)).toBe(false);
  });
});
