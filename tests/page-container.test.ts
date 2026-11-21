import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_GUTTER, PAGE_WIDTHS, pageContainer } from "../src/components/page-container";

const SRC = join(__dirname, "..", "src");
const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
});
const sources = files(SRC).map((path) => ({ path: path.slice(SRC.length + 1), text: readFileSync(path, "utf8") }));
const read = (path: string) => readFileSync(join(SRC, path), "utf8");

describe("conteneur de page partagé", () => {
  it("trois types : lecture sans largeur (la grille du cours la porte), standard 64rem, large 80rem", () => {
    expect(PAGE_WIDTHS).toEqual({ reading: "max-w-none", standard: "max-w-5xl", wide: "max-w-7xl" });
    expect(pageContainer()).toContain("max-w-5xl");
    expect(pageContainer("wide")).toContain(PAGE_GUTTER);
    expect(pageContainer("standard", { spacing: false })).not.toMatch(/\bp[tb]-/);
  });

  it("chaque coquille passe par le conteneur, sans largeur propre", () => {
    expect(read("components/shell.tsx")).toContain("pageContainer(width)");
    expect(read("components/legal-shell.tsx")).toContain("pageContainer()");
    expect(read("app/actualites/[id]/page.tsx")).toContain('pageContainer("reading")');
  });

  it("une page ne choisit qu'un type, jamais une largeur", () => {
    const calls = sources.flatMap(({ path, text }) => [...text.matchAll(/<Shell user=\{\w+\}([^>]*)>/g)].map((m) => ({ path, rest: m[1].trim() })));
    expect(calls.length).toBeGreaterThan(40);
    for (const { path, rest } of calls) expect(rest, path).toMatch(/^(width="(reading|wide)")?$/);
  });

  it("plus d'enveloppe de largeur ad hoc autour d'une page", () => {
    const adHoc = sources.filter(({ text }) => /max-w-\[(76|90)rem\]/.test(text)).map(({ path }) => path);
    expect(adHoc).toEqual([]);
  });

  it("le cours, l'éditeur et la correction restent en lecture : leur grille garde sa marge de notes", () => {
    for (const page of ["app/d/[id]/page.tsx", "app/editer/[id]/page.tsx", "app/corriger/[id]/page.tsx", "app/contribuer/nouveau/page.tsx"]) {
      expect(read(page), page).toContain('width="reading"');
    }
  });
});
