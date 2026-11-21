import { describe, expect, it } from "vitest";
import { collectFileIds, strayObjects, unreferencedFiles } from "../src/lib/orphan-files";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-06-15T12:00:00Z");
const hoursAgo = (n: number) => new Date(now.getTime() - n * 3_600_000);
const DAY = 86_400_000;

describe("collectFileIds", () => {
  it("trouve les références dans les blocs et le Markdown, sans tenir compte de la casse", () => {
    const found = new Set<string>();
    collectFileIds(JSON.stringify([{ type: "image", props: { url: `/files/${A}?inline=1` } }]), found);
    collectFileIds(`![schéma](https://campuss.fr/files/${B.toUpperCase()}?inline=1)`, found);
    collectFileIds(null, found);
    expect(found).toEqual(new Set([A, B]));
  });
});

describe("unreferencedFiles", () => {
  const old = hoursAgo(24 * 30);
  it("ne retient que l'image ancienne, sans référence, d'un cours au repos", () => {
    const files = [
      { id: A, createdAt: old, lastActivity: old },
      { id: B, createdAt: old, lastActivity: old },
    ];
    expect(unreferencedFiles(files, new Set([B]), now, DAY).map((f) => f.id)).toEqual([A]);
  });

  it("n'efface pas une image tout juste envoyée, pas encore enregistrée", () => {
    expect(unreferencedFiles([{ id: A, createdAt: hoursAgo(23), lastActivity: old }], new Set(), now, DAY)).toEqual([]);
    expect(unreferencedFiles([{ id: A, createdAt: hoursAgo(25), lastActivity: old }], new Set(), now, DAY)).toHaveLength(1);
  });

  it("attend aussi que le cours soit au repos : l'auteur peut encore annuler", () => {
    expect(unreferencedFiles([{ id: A, createdAt: old, lastActivity: hoursAgo(2) }], new Set(), now, DAY)).toEqual([]);
  });

  it("une référence en majuscules protège le fichier", () => {
    expect(unreferencedFiles([{ id: A.toUpperCase(), createdAt: old }], new Set([A]), now, DAY)).toEqual([]);
  });
});

describe("strayObjects", () => {
  it("ne vise que les objets anciens sans ligne, et jamais une clé inattendue", () => {
    const objects = [
      { key: `files/${A}`, lastModified: hoursAgo(48) },
      { key: `files/${B}`, lastModified: hoursAgo(48) },
      { key: `files/${C}`, lastModified: hoursAgo(1) },
      { key: "files/notes.txt", lastModified: hoursAgo(48) },
      { key: `docs/${A}/index.html`, lastModified: hoursAgo(48) },
    ];
    expect(strayObjects(objects, "files/", new Set([B]), now, DAY)).toEqual([`files/${A}`]);
  });
});
