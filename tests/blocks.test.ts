import { describe, expect, it } from "vitest";
import { blocksToMarkdown, hasForeignMedia, markdownToBlocks, sanitizeBlocks, youtubeId } from "@/lib/blocks";
import { courseText, normalizeCourse } from "@/lib/course";
import { obsidianToMarkdown, snappyDecompress } from "@/lib/import-text";

const FILE = "/files/11111111-1111-4111-8111-111111111111?inline=1";
const text = (t: string, styles = {}) => ({ type: "text", text: t, styles });

describe("blocs et Markdown", () => {
  it("publie les styles par des extensions connues, puis les relit", () => {
    const md = blocksToMarkdown([
      { type: "heading", props: { level: 2 }, content: [text("Partie")] },
      { type: "paragraph", content: [text("gras", { bold: true }), text(" "), text("sou", { underline: true }), text(" "), text("jaune", { backgroundColor: "yellow" }), text(" "), text("rouge", { textColor: "red" })] },
      { type: "callout", props: { kind: "attention" }, content: [text("Piège")] },
      { type: "toggleListItem", content: [text("Plus")], children: [{ type: "paragraph", content: [text("caché")] }] },
      { type: "checkListItem", props: { checked: true }, content: [text("fait")] },
      { type: "divider" },
      { type: "video", props: { url: FILE } },
      { type: "youtube", props: { url: "https://youtu.be/dQw4w9WgXcQ" } },
      { type: "mathBlock", content: [text("E=mc^2")] },
    ]);
    expect(md).toContain("**gras**");
    expect(md).toContain(":u[sou]");
    expect(md).toMatch(/:hl\[jaune\]\{c="?yellow"?\}/);
    expect(md).toContain("**Attention :** Piège");
    const back = markdownToBlocks(md);
    expect(back.map((b) => b.type)).toEqual(["heading", "paragraph", "callout", "toggleListItem", "checkListItem", "divider", "video", "youtube", "mathBlock"]);
    expect(JSON.stringify(back[1].content)).toContain('"underline":true');
    expect(JSON.stringify(back[1].content)).toContain('"backgroundColor":"yellow"');
    expect(back[2].props?.kind).toBe("attention");
    expect(back[3].children?.[0].type).toBe("paragraph");
  });

  it("garde la tabulation de l'éditeur à la publication, puis la relit", () => {
    const md = blocksToMarkdown([
      { type: "paragraph", content: [text("Parent")], children: [{ type: "paragraph", content: [text("Décalé")] }] },
      { type: "paragraph", content: [text("Suite")] },
    ]);
    expect(md).toContain(":::indent");
    expect(normalizeCourse(md)).toContain(":::indent");
    const back = markdownToBlocks(md);
    expect(back.map((b) => b.type)).toEqual(["paragraph", "paragraph"]);
    expect(back[0].children?.[0].content).toEqual([text("Décalé")]);
  });

  it("garde le texte contenant deux-points tel quel", () => {
    const out = normalizeCourse("Rendez-vous à 12:30, voir note:importante et ::rien\n");
    expect(courseText(out)).toBe("Rendez-vous à 12:30, voir note:importante et ::rien");
    expect(normalizeCourse(out)).toBe(out);
  });

  it("n'accepte aucune extension dangereuse", () => {
    const out = normalizeCourse(':video{src="https://evil.example/x.mp4"}\n\n::video{src="https://evil.example/x.mp4"}\n\n::youtube{id="../../evil"}\n\n:hl[a]{c="url(x)"}\n\n::file{src="javascript:alert(1)"}');
    expect(out).not.toMatch(/^::/m);
    expect(out).not.toContain("evil.example");
    expect(out).not.toContain("javascript");
    expect(out).not.toMatch(/:hl\[/);
  });

  it("filtre les blocs reçus du navigateur", () => {
    const clean = sanitizeBlocks([
      { type: "script", content: "x" },
      { type: "paragraph", props: { backgroundColor: "url(evil)", onclick: "x" }, content: [{ type: "link", href: "javascript:alert(1)", content: [text("lien")] }, { type: "evil" }, text("t", { backgroundColor: "yellow;x", bold: true, evil: 1 })] },
      { type: "image", props: { url: "https://evil.example/pixel.png" } },
      { type: "image", props: { url: FILE } },
      { type: "youtube", props: { url: "https://evil.example/watch?v=abcdefgh" } },
    ]);
    expect(clean.map((b) => b.type)).toEqual(["paragraph", "image", "image", "youtube"]);
    expect(clean[0].props).toEqual({});
    expect(JSON.stringify(clean[0])).not.toContain("javascript");
    expect(clean[0].content).toEqual([text("lien"), text("t", { bold: true })]);
    expect(clean[1].props?.url).toBe("");
    expect(clean[2].props?.url).toBe(FILE);
    expect(clean[3].props?.url).toBe("");
    expect(blocksToMarkdown(clean)).not.toContain("evil");
  });

  it("reconnaît les adresses YouTube", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://evil.example/youtube.com/watch?v=dQw4w9WgXcQ")).toBe("");
  });
});

describe("imports", () => {
  it("convertit la syntaxe d'Obsidian", () => {
    const out = obsidianToMarkdown("---\na: 1\n---\nVoir [[A|B]] et [[C]], ==ici== %%non%%\n> [!warning] Piège\n```\n[[code]]\n```\n![[x.png]]");
    expect(out).toContain("Voir B et C, :hl[ici]{c=yellow}");
    expect(out).not.toContain("%%");
    expect(out).toContain("**Attention :** Piège");
    expect(out).toContain("[[code]]");
    expect(out).toContain("![](<x.png>)");
  });

  it("décompresse Snappy et refuse un bloc piégé", () => {
    const ok = Uint8Array.from([5, 4 << 2, 104, 101, 108, 108, 111]);
    expect(new TextDecoder().decode(snappyDecompress(ok))).toBe("hello");
    expect(() => snappyDecompress(Uint8Array.from([5, 1 | (1 << 2), 200]))).toThrow();
    expect(() => snappyDecompress(Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0x7f]))).toThrow();
  });
});

describe("médias extérieurs", () => {
  it("ne relit aucune image ni aucun média hors du site depuis le Markdown", () => {
    const blocks = markdownToBlocks(`![a](https://evil.example/a.png)\n\n![b](${FILE})\n\n::video{src="https://evil.example/v.mp4"}\n\n::file{src="${FILE}" name="x"}`);
    // Une extension refusée redevient du texte, sans aucune adresse chargée
    const media = blocks.filter((b) => b.type !== "paragraph");
    expect(media.map((b) => b.type)).toEqual(["image", "file"]);
    expect(JSON.stringify(media)).not.toContain("evil");
  });

  it("repère les blocs à vider dans l'éditeur", () => {
    expect(hasForeignMedia({ type: "image", props: { url: "https://evil.example/a.png" } })).toBe(true);
    expect(hasForeignMedia({ type: "file", props: { url: "data:text/html,x" } })).toBe(true);
    expect(hasForeignMedia({ type: "image", props: { url: FILE } })).toBe(false);
    expect(hasForeignMedia({ type: "image", props: { url: "" } })).toBe(false);
    expect(hasForeignMedia({ type: "youtube", props: { url: "https://youtu.be/dQw4w9WgXcQ" } })).toBe(false);
  });
});
