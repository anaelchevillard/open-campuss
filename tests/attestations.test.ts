import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ATTESTATION_REMINDERS, ATTESTATIONS, attestationVersion } from "../src/lib/attestations";
import { proxy } from "../src/proxy";

describe("engagements", () => {
  it("le fond reste : le contenu est à moi ou j'ai l'accord, et j'en reste responsable", () => {
    expect(ATTESTATIONS.share).toMatch(/le mien/);
    expect(ATTESTATIONS.share).toMatch(/accord écrit/);
    expect(ATTESTATIONS.share).toMatch(/responsable/);
    expect(ATTESTATION_REMINDERS.share).toMatch(/En envoyant, tu confirmes que/);
    expect(ATTESTATION_REMINDERS.share).toMatch(/responsable/);
    expect(ATTESTATIONS.share).not.toMatch(/décharge/);
  });

  it("chaque texte a sa version, stable et assez courte pour la colonne", () => {
    const versions = (Object.keys(ATTESTATIONS) as (keyof typeof ATTESTATIONS)[]).map(attestationVersion);
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions.every((v) => /^[0-9a-f]{8}$/.test(v))).toBe(true);
    expect(attestationVersion("share")).toBe(attestationVersion("share"));
  });
});

describe("partage depuis le téléphone", () => {
  const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  const worker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  beforeEach(() => { vi.stubEnv("BASE_URL", "https://campuss.fr"); vi.stubEnv("CONTENT_ORIGIN", ""); });
  const post = (path: string, origin?: string) => proxy(new NextRequest(`https://campuss.fr${path}`, { method: "POST", body: "x", headers: { "content-length": "1", ...(origin ? { origin } : {}) } }));

  it("le manifeste et le service worker visent la même adresse", () => {
    expect(manifest.share_target).toMatchObject({ action: "/partage", method: "POST", enctype: "multipart/form-data" });
    expect(manifest.share_target.params.files[0].name).toBe("files");
    expect(worker).toContain('url.pathname === "/partage"');
    expect(worker).toContain('getAll("files")');
  });

  it("sans service worker, le proxy renvoie vers la zone de dépôt sans lire l'envoi", () => {
    const response = post("/partage", "null");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/contribuer/nouveau?importer=1");
  });

  it("rien d'autre n'est ouvert : les autres routes gardent le contrôle d'origine", () => {
    for (const path of ["/partage/x", "/partages", "/api/editor/ocr", "/api/editor/import"]) expect(post(path, "null").status, path).toBe(403);
  });
});
