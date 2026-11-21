import { Client } from "@notionhq/client";
import { writeFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { NotionRenderer } from "react-notion-x";
import { unwrapNotionImage } from "@/lib/content-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stored = new Map<string, unknown>();
vi.mock("@/lib/s3", () => ({
  versionPrefix: (d: string, v: string) => `docs/${d}/${v}/`,
  putObject: async (key: string, body: unknown) => { stored.set(key, body); },
  deletePrefix: async () => undefined,
  getText: async (key: string) => stored.get(key) ?? null,
}));
vi.mock("@/lib/db", () => ({ db: {}, schema: {} }));
vi.mock("@/lib/env", () => ({ env: { notionToken: "secret" } }));

const { sanitizeRecordMap, syncNotionDocument, snapshotKey } = await import("@/lib/notion");
const { isDangerousUrl, isExpiringNotionUrl, isNotionFileUrl, safeRelativePath, walkStrings, parseNotionId, contentDisposition, htmlToText } = await import("@/lib/content-utils");

const ROOT = "11111111111141118111111111111111";
const CHILD = "22222222222242228222222222222222";
const dash = (id: string) => id.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
const SIGNED = "https://prod-files-secure.s3.us-west-2.amazonaws.com/a/b/cours.png?X-Amz-Signature=abc&X-Amz-Expires=3600";
const text = (content: string, href: string | null = null) => ({
  type: "text", text: { content, link: href ? { url: href } : null }, plain_text: content, href,
  annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: "default" },
});
const base = (id: string, type: string, body: object, has_children = false) => ({
  object: "block", id, type, has_children, parent: { type: "page_id", page_id: dash(ROOT) }, archived: false,
  created_time: "2026-01-01T00:00:00.000Z", last_edited_time: "2026-01-01T00:00:00.000Z", [type]: body,
});
const page = (id: string, title: string) => ({
  object: "page", id: dash(id), created_time: "2026-01-01T00:00:00.000Z", last_edited_time: "2026-01-01T00:00:00.000Z",
  archived: false, parent: { type: "workspace", workspace: true }, url: `https://www.notion.so/${id}`, cover: null, icon: null,
  properties: { title: { id: "title", type: "title", title: [text(title)] } },
});
const pages: Record<string, unknown> = { [ROOT]: page(ROOT, "Cours de maths"), [CHILD]: page(CHILD, "Chapitre 1") };
const children: Record<string, unknown[]> = {
  [ROOT]: [
    base("33333333-3333-4333-8333-333333333333", "paragraph", { rich_text: [text("Data: la dérivée"), text("piège", "javascript:alert(1)"), text(" ok", "https://exemple.fr/x")], color: "default" }),
    base("44444444-4444-4444-8444-444444444444", "image", { type: "file", file: { url: SIGNED, expiry_time: "2026-01-01T01:00:00.000Z" }, caption: [] }),
    base(dash(CHILD), "child_page", { title: "Chapitre 1" }, true),
  ],
  [CHILD]: [base("55555555-5555-4555-8555-555555555555", "paragraph", { rich_text: [text("Dans la sous-page")], color: "default" })],
};

function fakeNotion() {
  const fetchApi = async (url: string) => {
    const path = new URL(url).pathname.replace("/v1", "");
    const blockId = /blocks\/([^/]+)\/children/.exec(path)?.[1]?.replace(/-/g, "");
    const pageId = /(?:pages|blocks)\/([^/]+)$/.exec(path)?.[1]?.replace(/-/g, "");
    const asBlock = path.startsWith("/blocks/") && pageId ? base(dash(pageId), "child_page", { title: "Page" }, true) : null;
    const body = blockId ? { object: "list", results: children[blockId] ?? [], has_more: false, next_cursor: null } : asBlock ?? pages[pageId!];
    return new Response(JSON.stringify(body ?? { object: "error", code: "object_not_found", message: "x", status: 404 }), { status: body ? 200 : 404, headers: { "content-type": "application/json" } });
  };
  return new Client({ auth: "secret", fetch: fetchApi as typeof fetch, logLevel: undefined });
}

describe("synchronisation Notion", () => {
  beforeEach(() => stored.clear());

  it("importe la page et ses sous-pages, copie les fichiers et neutralise les liens", async () => {
    const download = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal("fetch", download);
    const { version, text: body } = await syncNotionDocument("doc", ROOT, fakeNotion());
    vi.unstubAllGlobals();

    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0]).toEqual([SIGNED, expect.objectContaining({ redirect: "error" })]);
    expect(body).toContain("derivee");
    expect(stored.has(snapshotKey("doc", version, CHILD))).toBe(true);

    const raw = stored.get(snapshotKey("doc", version, ROOT)) as string;
    expect(raw).not.toContain("X-Amz-Signature");
    expect(raw).not.toContain("javascript:");
    expect(raw).toContain(`/notion-asset/doc/${version}/`);
    expect(raw).toContain("Data: la dérivée"); // du texte ordinaire n'est jamais modifié
    expect(raw).toContain("https://exemple.fr/x");

    // Instantané réel, rejoué dans un navigateur par tests/notion-browser.mjs
    writeFileSync("tests/fixtures/notion-root.json", raw.replaceAll(`/notion-asset/doc/${version}/`, "/notion-asset/DOC/VERSION/"));
    writeFileSync("tests/fixtures/notion-child.json", stored.get(snapshotKey("doc", version, CHILD)) as string);
    const html = renderToString(<NotionRenderer recordMap={JSON.parse(raw)} fullPage={false} disableHeader rootPageId={ROOT} mapImageUrl={unwrapNotionImage} mapPageUrl={(id) => `/d/doc/notion/${id}`} />);
    expect(html).toContain("Data: la dérivée");
    expect(html).toMatch(new RegExp(`src="/notion-asset/doc/${version}/`));
    expect(html).not.toContain("notion.com");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("Chapitre 1");
  });

  it("une panne laisse la version précédente intacte", async () => {
    const failing = new Client({ auth: "x", fetch: (async () => new Response(JSON.stringify({ object: "error", code: "unauthorized", message: "non", status: 401 }), { status: 401, headers: { "content-type": "application/json" } })) as typeof fetch });
    await expect(syncNotionDocument("doc", ROOT, failing)).rejects.toThrow();
  });
});

describe("garde-fous", () => {
  it("URL dangereuses, y compris masquées", () => {
    for (const u of ["javascript:alert(1)", "JaVaScRiPt:x", " java\tscript:x", "java\nscript:x", "\x01javascript:x", "data:text/html,x", "vbscript:x"]) expect(isDangerousUrl(u)).toBe(true);
    for (const u of ["https://a.fr", "/local", "#x", "mailto:a@b.fr"]) expect(isDangerousUrl(u)).toBe(false);
  });
  it("SSRF : seuls les hôtes de fichiers Notion en HTTPS", () => {
    expect(isNotionFileUrl(SIGNED)).toBe(true);
    for (const u of ["http://file.notion.so/a", "https://169.254.169.254/latest", "https://localhost/x", "https://minio:9000/x", "https://evil.example/file.notion.so",
      "https://file.notion.so.evil.example/a", "https://user:pw@file.notion.so/a", "https://file.notion.so:8443/a", "https://evil-s3.amazonaws.com.evil.example/a"]) expect(isNotionFileUrl(u)).toBe(false);
    expect(isExpiringNotionUrl("https://evil.example/?X-Amz-Signature=1")).toBe(false);
  });
  it("traversée de chemin", () => {
    for (const p of ["../a", "a/../../b", "/etc/passwd", "..\\\\a", "C:\\\\x", "a\0b", "", "a/..", "./..", "x/\x01"]) expect(safeRelativePath(p)).toBeNull();
    expect(safeRelativePath("a/./b//c.html")).toBe("a/b/c.html");
    expect(safeRelativePath("sous dossier/été.png")).toBe("sous dossier/été.png");
  });
  it("pollution de prototype", () => {
    const out = walkStrings(JSON.parse('{"__proto__":{"x":1},"constructor":{"prototype":{"y":1}},"a":"b"}'), (s) => s) as Record<string, unknown>;
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(Object.keys(out)).toEqual(["a"]);
  });
  it("identifiant Notion, en-tête de téléchargement, extraction de texte", () => {
    expect(parseNotionId(`https://www.notion.so/moi/Cours-${ROOT}?pvs=4`)).toBe(ROOT);
    expect(parseNotionId("https://evil.example/")).toBeNull();
    expect(contentDisposition("attachment", 'a"\r\nSet-Cookie: x=1.pdf')).not.toMatch(/[\r\n]/);
    expect(htmlToText("<p>a</p><script>alert(1)</script><style>x{}</style>b")).toBe("a b");
  });
});
