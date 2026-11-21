import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CourseBody } from "@/components/course-body";
import { blocksToMarkdown, markdownToBlocks, sanitizeBlocks } from "@/lib/blocks";
import { isHtmlAttachment } from "@/lib/content-utils";
import { normalizeCourse } from "@/lib/course";
import { ARTIFACT_SANDBOX, artifactCsp, artifactRef, clampHeight, heightFromMessage, MAX_HEIGHT, MIN_HEIGHT } from "@/lib/rich/artifact";
import { inspectArtifactZip, readArtifactZipEntry } from "@/lib/rich/artifact-zip";

const FILE = "11111111-1111-4111-8111-111111111111";
const block = { type: "artifact", props: { src: `/files/${FILE}`, entry: "site/index.html", title: "Simulation", display: "bloc" } };

describe("Bloc artefact sérialisé", () => {
  it("bloc → Markdown → bloc, sans perte", () => {
    const markdown = blocksToMarkdown(sanitizeBlocks([block]));
    expect(markdown).toContain(`::artifact{`);
    expect(markdown).toContain(`src="/files/${FILE}"`);
    const back = markdownToBlocks(markdown);
    expect(back).toEqual([{ type: "artifact", props: { src: `/files/${FILE}`, entry: "site/index.html", title: "Simulation", display: "bloc" } }]);
  });
  it("la normalisation garde un artefact valide et rend le reste en texte", () => {
    expect(normalizeCourse(`::artifact{src="/files/${FILE}" title="A"}`)).toContain("::artifact");
    const foreign = normalizeCourse(`::artifact{src="https://evil.example/x.html"}`);
    expect(foreign).not.toMatch(/^::artifact\{/m);
  });
  it("refuse une adresse extérieure, un chemin qui sort de l'archive ou une entrée non HTML", () => {
    expect(artifactRef({ src: "https://evil.example/a.html" })).toBeNull();
    expect(artifactRef({ src: `/files/${FILE}?inline=1` })).toBeNull();
    expect(artifactRef({ src: `/files/${FILE}`, entry: "../../etc/passwd" })).toBeNull();
    expect(artifactRef({ src: `/files/${FILE}`, entry: "/abs/index.html" })).toBeNull();
    expect(artifactRef({ src: `/files/${FILE}`, entry: "script.js" })).toBeNull();
    expect(artifactRef({ src: `/files/${FILE}`, display: "javascript:" })?.display).toBe("bloc");
  });
  it("le navigateur ne fait passer qu'un fichier Campuss", () => {
    const [clean] = sanitizeBlocks([{ type: "artifact", props: { src: "javascript:alert(1)", entry: "x", onload: "alert(1)" } }]);
    expect(clean.props).toEqual({ src: "", entry: "index.html", title: "", display: "bloc" });
    expect(blocksToMarkdown([clean])).not.toContain("artifact");
  });
});

describe("Rendu isolé", () => {
  it("un cadre de l'origine de contenu, en bac à sable sans same-origin, jamais le HTML de l'artefact", () => {
    const html = renderToString(createElement(CourseBody, { markdown: `::artifact{src="/files/${FILE}" title="Sim"}`, rich: { artifactSrc: (id: string, entry: string) => `https://contenu.example/embed/t/${id}/${entry}` } }));
    expect(html).toContain(`src="https://contenu.example/embed/t/${FILE}/index.html"`);
    expect(html).toContain(`sandbox="${ARTIFACT_SANDBOX}"`);
    expect(ARTIFACT_SANDBOX).not.toContain("allow-same-origin");
    expect(ARTIFACT_SANDBOX).not.toContain("allow-top-navigation");
    // Repli lisible à l'impression et pour le PDF officiel
    expect(html).toContain("Contenu interactif « Sim »");
  });
  it("sans adresse signée (actualité, aperçu), rien n'est chargé", () => {
    const html = renderToString(createElement(CourseBody, { markdown: `::artifact{src="/files/${FILE}"}` }));
    expect(html).not.toContain("<iframe");
  });
  it("la hauteur annoncée est bornée, tout autre message ignoré", () => {
    expect(heightFromMessage({ type: "campuss-height", height: 99999 })).toBe(MAX_HEIGHT);
    expect(heightFromMessage({ type: "campuss-height", height: 1 })).toBe(MIN_HEIGHT);
    expect(heightFromMessage({ type: "campuss-storage", height: 300 })).toBeNull();
    expect(heightFromMessage("campuss-height")).toBeNull();
    expect(clampHeight("abc")).toBeGreaterThan(0);
  });
});

describe("CSP de /embed", () => {
  const csp = artifactCsp({ contentOrigin: "https://contenu.example", baseOrigin: "https://campuss.fr" });
  it("bac à sable, aucune connexion sortante, seul le site peut l'afficher", () => {
    expect(csp).toMatch(/^sandbox allow-scripts /);
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("frame-ancestors https://campuss.fr");
    expect(csp).not.toMatch(/https?:\/\/(?!contenu\.example|campuss\.fr)/);
    expect(csp).not.toMatch(/\*/);
  });
  it("le proxy réserve /embed à l'origine de contenu", () => {
    const proxy = readFileSync("src/proxy.ts", "utf8");
    expect(proxy).toContain("view|vendor|embed");
    expect(proxy).toMatch(/!onContentHost && \/\^\\\/\(view\|embed\)/);
  });
});

describe("Archive et pièce jointe", () => {
  it("archive : page d'entrée et lecture d'un fichier, chemin hors archive introuvable", async () => {
    const zip = readFileSync("tests/fixtures/good.zip");
    const entry = await inspectArtifactZip(zip);
    expect(entry).toMatch(/\.html?$/);
    expect(await readArtifactZipEntry(zip, entry)).not.toBeNull();
    expect(await readArtifactZipEntry(zip, "../" + entry)).toBeNull();
  });
  it("archive sans page HTML refusée", async () => {
    await expect(inspectArtifactZip(readFileSync("tests/fixtures/nohtml.zip"))).rejects.toThrow();
  });
  it("pièce jointe HTML : extension, taille et texte", () => {
    const text = new TextEncoder().encode("<html>");
    expect(isHtmlAttachment("page.html", text, 10)).toBe(true);
    expect(isHtmlAttachment("page.exe", text, 10)).toBe(false);
    expect(isHtmlAttachment("page.html", new Uint8Array([60, 0, 1]), 10)).toBe(false);
    expect(isHtmlAttachment("page.html", text, 6 * 1024 * 1024)).toBe(false);
  });
});
