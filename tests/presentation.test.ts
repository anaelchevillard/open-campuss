import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { aiProvider, proofsOf, roundDown } from "@/components/landing/rules";

describe("chiffres de la présentation", () => {
  test("arrondit vers le bas, jamais vers le haut", () => {
    expect(roundDown(6)).toBe(6);
    expect(roundDown(47)).toBe(40);
    expect(roundDown(349)).toBe(300);
    expect(roundDown(1249)).toBe(1200);
  });

  test("cache un chiffre sous son seuil", () => {
    const proofs = proofsOf({ documents: 29, subjects: 6, cards: 1000, thanks: 10, students: 52 });
    expect(proofs.map((p) => p.key)).toEqual(["subjects", "cards", "students"]);
    expect(proofs.find((p) => p.key === "students")).toMatchObject({ value: 50, more: true });
    expect(proofs.find((p) => p.key === "subjects")).toMatchObject({ value: 6, more: false });
  });
});

describe("fournisseur d'IA nommé d'après AI_BASE_URL", () => {
  test("Gemini par défaut, avec son hôte", () => {
    expect(aiProvider("https://generativelanguage.googleapis.com/v1beta/openai")).toEqual({ name: "Google (Gemini)", host: "generativelanguage.googleapis.com" });
  });

  test("un hôte inconnu est écrit tel quel", () => {
    expect(aiProvider("https://llm.exemple.eu/v1")).toEqual({ name: "llm.exemple.eu", host: "llm.exemple.eu" });
  });

  test("une adresse invalide ne casse pas la page", () => {
    expect(aiProvider("pas une url").host).toBe("");
  });
});

describe("présentation : mouvement réduit", () => {
  const css = readFileSync(join(process.cwd(), "src/styles/landing.css"), "utf8");
  const motionBlock = css.slice(css.indexOf("@media (prefers-reduced-motion: no-preference)"), css.indexOf("/* Apparitions"));

  test("toute animation en boucle ou d'entrée est dans le bloc « no-preference » et exclut le réglage Aa", () => {
    const outside = css.replace(motionBlock, "").match(/animation:\s*lp-[\w-]+/g) ?? [];
    expect(outside).toEqual([]);
    for (const line of motionBlock.split("\n").filter((l) => l.includes("animation:"))) expect(line).toContain("html:not(.reduce-motion)");
  });

  test("les apparitions ne cachent rien tant que le moteur de la page n'a pas démarré", () => {
    expect(css).toMatch(/\.lp-root\[data-fx\] \.lp-reveal:not\(\[data-shown\]\)/);
    expect(css).not.toMatch(/^\.lp-reveal\s*\{[^}]*opacity:\s*0/m);
  });
});

describe("présentation : sobriété et thème", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  const css = read("src/styles/landing.css");
  const page = read("src/app/page.tsx");

  test("plus de bouton aimanté, nulle part", () => {
    for (const file of ["src/app/page.tsx", "src/components/landing/top-bar.tsx", "src/components/landing/landing-fx.tsx", "src/styles/landing.css"]) {
      expect(read(file), file).not.toMatch(/magnet/i);
    }
  });

  test("aucune scène forcée en sombre : la page suit son thème", () => {
    expect(css).not.toMatch(/(?<!prefers-)color-scheme:\s*dark/);
    expect(css).not.toMatch(/--background:\s*#/);
  });

  test("les captures sombres suivent le thème choisi, sinon le système", async () => {
    const { darkMedia } = await import("@/components/landing/shot");
    expect(darkMedia("dark")).toBe("all");
    expect(darkMedia("light")).toBe("not all");
    expect(darkMedia(null)).toBe("(prefers-color-scheme: dark)");
  });

  test("le téléphone dessiné a l'écran d'une capture d'iPhone, sans barre d'état ajoutée", () => {
    expect(css).toMatch(/\.lp-iphone \{[^}]*aspect-ratio: 100 \/ 207/);
    expect(css).not.toContain("lp-iphone-status");
    const manifest = JSON.parse(read("public/presentation/manifest.json"));
    for (const name of ["tel-cours", "tel-accueil", "ia-fiches", "tel-partiels", "tel-amis"]) expect(manifest[name], name).toEqual({ width: 393, height: 852 });
  });

  test("pas de tics de page générée : halos, verre dépoli, texte en dégradé, bandeau, étincelles", () => {
    expect(css).not.toMatch(/backdrop-filter|background-clip:\s*text|radial-gradient|✦|lp-marquee|lp-aurora|lp-float/);
    expect(page).not.toMatch(/CountUp|lp-marquee|lp-float|révolution|booste|tout-en-un/i);
  });

  test("les liens internes vers « / » rechargent la page (CSP du WebAssembly)", () => {
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []);
    const soft = walk(join(process.cwd(), "src")).filter((file) => /<Link[^>]*href=\{?"\/"/.test(readFileSync(file, "utf8")));
    expect(soft).toEqual([]);
  });
});
