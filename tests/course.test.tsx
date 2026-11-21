import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CourseBody, courseToc } from "@/components/course-body";
import { blocksToMarkdown } from "@/lib/blocks";
import { calloutKind, courseOutline, normalizeCourse } from "@/lib/course";

const ID = "/files/11111111-1111-4111-8111-111111111111?inline=1";

describe("mise en page commune", () => {
  it("ramène tous les titres aux niveaux 2 et 3", () => {
    const out = normalizeCourse("# A\n\n## B\n\n### C\n\n#### D\n\n###### E");
    expect(out.match(/^#+ /gm)).toEqual(["## ", "## ", "### ", "### ", "### "]);
  });
  it("retire HTML, images externes et liens dangereux", () => {
    const out = normalizeCourse(`texte

<script>alert(1)</script>

<img src=x onerror=alert(1)>

![a](https://evil.example/p.png)

![b](${ID})

[x](javascript:alert(1)) [y](JaVa\tScript:alert(1)) [z](data:text/html,a) [ok](https://exemple.fr)

![c](/files/../admin) ![d](//evil.example/p.png)

[ref]: https://evil.example`);
    expect(out).not.toMatch(/<script|onerror|evil\.example|data:|\/admin|\]\((javascript|JaVa)/i);
    expect(out).toContain(ID.replace("?", "\\?").replace("\\?", "?"));
    expect(out).toContain("https://exemple.fr");
  });
  it("garde les formules, les tableaux et le texte accentué", () => {
    const out = normalizeCourse("## Été\n\n$x^2$\n\n$$\nE=mc^2\n$$\n\n| a | b |\n| - | - |\n| 1 | 2 |");
    expect(out).toContain("$x^2$");
    expect(out).toContain("E=mc^2");
    expect(out).toContain("| a");
    expect(out).toContain("Été");
  });
  it("reconnaît les encadrés", () => {
    expect(calloutKind("Définition : x")).toBe("definition");
    expect(calloutKind("Théorème 2")).toBe("theoreme");
    expect(calloutKind("À retenir")).toBe("retenir");
    expect(calloutKind("une citation")).toBeUndefined();
  });
  it("ne rend jamais de HTML brut, même si la base contenait un texte piégé", () => {
    const html = renderToString(<CourseBody markdown={`## A\n\n<script>alert(1)</script>\n\n<iframe src="https://evil.example"></iframe>\n\n![p](https://evil.example/p.png)\n\n[x](javascript:alert(1))\n\n> **Définition :** ok\n\n## B\n\n$x$`} />);
    expect(html).not.toMatch(/<script|<iframe|<img|src="https?:|href="javascript:/i);
    expect(html).toContain('class="definition"');
    expect(html).toContain("katex");
  });
  it("alimente le sommaire avec les titres", () => {
    expect(courseToc("## A\n\n### B\n\ntexte").map((i) => [i.id, i.depth])).toEqual([["a", 2], ["b", 3]]);
  });
  it("donne des ancres uniques", () => {
    expect(courseOutline("## Partie\n\n## Partie").map((i) => i.id)).toEqual(["partie", "partie-2"]);
  });
});

describe("tabulation à la publication", () => {
  const text = (value: string) => ({ type: "text", text: value, styles: {} });
  // Le cas de la capture : une liste décalée avec Tab sous le paragraphe qui l'annonce
  const markdown = blocksToMarkdown([
    { type: "paragraph", content: [text("On distingue deux grandes traditions :")], children: [
      { type: "bulletListItem", content: [text("La tradition éthique")] },
      { type: "bulletListItem", content: [text("La tradition mécanique")] },
    ] },
    { type: "paragraph", content: [text("À partir de la fin du XIXe siècle…")] },
  ] as never);
  it("rend un simple décalage, jamais une citation", () => {
    const html = renderToString(<CourseBody markdown={normalizeCourse(markdown)} />);
    expect(html).toContain('class="course-indent"');
    expect(html).not.toContain("<blockquote");
  });
  it("le décalage n'a pas de filet à gauche (le trait vertical venait de lui)", () => {
    const css = readFileSync("src/styles/course.css", "utf8");
    const rules = [...css.matchAll(/([^{}]*\.course-indent[^{}]*)\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const [, , body] of rules) expect(body).not.toMatch(/border|box-shadow|outline/);
  });
});
