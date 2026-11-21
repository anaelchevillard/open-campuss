import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  checkImageFile, checkImageSize, clampCrop, cropRect, IMAGE_RULES, initialCrop, MAX_IMAGE_BYTES, maxZoom, needsCrop, outputSize, panCrop, zoomCrop,
} from "@/lib/image-crop";
import { deleteInit } from "@/lib/image-upload";
import { backTarget } from "@/components/nav/back-target";
import { settingHref } from "@/components/profile/settings/sections";

describe("« Retirer la photo » arrive jusqu'au serveur", () => {
  // Petit serveur qui renvoie l'en-tête Content-Length reçu : le proxy refuse (411) toute écriture qui n'en a pas
  let url = "";
  const server = createServer((req, res) => { res.end(JSON.stringify({ length: req.headers["content-length"] ?? null })); });
  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/account/avatar`;
  });
  afterAll(() => { server.close(); });

  it("cause : un DELETE sans corps part sans Content-Length (refusé par le proxy)", async () => {
    const { length } = await (await fetch(url, { method: "DELETE" })).json();
    expect(length).toBeNull();
  });
  it("correctif : la suppression porte un petit corps, donc un Content-Length, que le proxy accepte", async () => {
    const { length } = await (await fetch(url, deleteInit())).json();
    expect(length).toBe("2");
    expect(/^\d+$/.test(length)).toBe(true);
  });
});

describe("Mauvaise image refusée dès le choix", () => {
  it("type : JPEG, PNG, WebP et GIF seulement (pas de HEIC, pas de SVG)", () => {
    expect(checkImageFile({ type: "image/jpeg", size: 2_000_000 })).toBeNull();
    expect(checkImageFile({ type: "image/webp", size: 10 })).toBeNull();
    expect(checkImageFile({ type: "image/heic", size: 10 })).toMatch(/Format non pris en charge/);
    expect(checkImageFile({ type: "image/svg+xml", size: 10 })).toMatch(/Format/);
    expect(checkImageFile({ type: "application/pdf", size: 10 })).toMatch(/Format/);
  });
  it("poids : 20 Mo au plus, jamais vide", () => {
    expect(checkImageFile({ type: "image/png", size: MAX_IMAGE_BYTES + 1 })).toMatch(/trop lourde/);
    expect(checkImageFile({ type: "image/png", size: 0 })).toMatch(/vide/);
  });
  it("dimensions minimales et plafond de pixels, avec la taille dans le message", () => {
    expect(checkImageSize(100, 400, "avatar")).toBe("Image trop petite (100 × 400) : 128 × 128 pixels au moins.");
    expect(checkImageSize(128, 128, "avatar")).toBeNull();
    expect(checkImageSize(1200, 140, "banner")).toMatch(/600 × 150/);
    expect(checkImageSize(1600, 400, "banner")).toBeNull();
    expect(checkImageSize(10_000, 6_000, "banner")).toMatch(/trop grande/);
  });
});

describe("Recadrage", () => {
  it("le recadrage n'est proposé que si le ratio diffère", () => {
    expect(needsCrop(512, 512, "avatar")).toBe(false);
    expect(needsCrop(4000, 3000, "avatar")).toBe(true);
    expect(needsCrop(1600, 400, "banner")).toBe(false);
    expect(needsCrop(1600, 402, "banner")).toBe(false);
    expect(needsCrop(1600, 900, "banner")).toBe(true);
  });
  it("au départ : le plus grand cadre au bon ratio, centré", () => {
    expect(cropRect(initialCrop(4000, 3000), 4000, 3000, "avatar")).toEqual({ x: 500, y: 0, width: 3000, height: 3000 });
    expect(cropRect(initialCrop(1600, 900), 1600, 900, "banner")).toEqual({ x: 0, y: 250, width: 1600, height: 400 });
  });
  it("le cadre reste toujours dans l'image, même tiré trop loin", () => {
    const far = panCrop(initialCrop(4000, 3000), -99_999, 99_999, 300, 4000, 3000, "avatar");
    const rect = cropRect(far, 4000, 3000, "avatar");
    expect(rect.x + rect.width).toBeLessThanOrEqual(4000);
    expect(rect.x).toBe(1000);
    expect(rect.y).toBe(0);
  });
  it("l'image suit le doigt : glisser à droite montre la partie gauche", () => {
    const start = zoomCrop(initialCrop(4000, 3000), 2, 4000, 3000, "avatar");
    const moved = panCrop(start, 100, 0, 300, 4000, 3000, "avatar");
    // cadre de 1 500 px affiché sur 300 px : 100 px d'écran = 500 px d'image
    expect(start.cx - moved.cx).toBeCloseTo(500);
  });
  it("zoom borné : ×4 au plus, et jamais sous la taille minimale", () => {
    expect(maxZoom(4000, 3000, "avatar")).toBe(4);
    expect(maxZoom(300, 300, "avatar")).toBeCloseTo(300 / 128);
    expect(maxZoom(600, 150, "banner")).toBe(1);
    expect(zoomCrop(initialCrop(4000, 3000), 10, 4000, 3000, "avatar").zoom).toBe(4);
    expect(zoomCrop(initialCrop(4000, 3000), 0.2, 4000, 3000, "avatar").zoom).toBe(1);
    expect(clampCrop({ cx: Number.NaN, cy: 0, zoom: Number.NaN }, 4000, 3000, "avatar")).toEqual({ cx: 2000, cy: 1500, zoom: 1 });
  });
  it("l'image envoyée a la taille de la règle, sans agrandissement", () => {
    expect(outputSize({ x: 0, y: 0, width: 3000, height: 3000 }, "avatar")).toEqual({ width: 512, height: 512 });
    expect(outputSize({ x: 0, y: 0, width: 300, height: 300 }, "avatar")).toEqual({ width: 300, height: 300 });
    expect(outputSize({ x: 0, y: 250, width: 1600, height: 400 }, "banner")).toEqual({ width: IMAGE_RULES.banner.outWidth, height: IMAGE_RULES.banner.outHeight });
  });
});

describe("Navigation des paramètres", () => {
  const q = (search: string) => new URLSearchParams(search);
  it("la flèche retour du téléphone porte le nom de la page parente", () => {
    expect(backTarget("/parametres/compte", q(""))).toEqual({ href: "/parametres", label: "Paramètres" });
    expect(backTarget("/parametres", q(""))).toEqual({ href: "/moi", label: "Moi" });
    expect(backTarget("/u/abc", q("modifier=1&depuis=parametres"))).toEqual({ href: "/parametres", label: "Paramètres" });
    expect(backTarget("/u/abc", q("modifier=1"))).toBeNull();
    expect(backTarget("/d/abc", q(""))).toBeNull();
  });
  it("un réglage du profil trouvé par la recherche garde sa section à travers la redirection", () => {
    expect(settingHref("profil", "reseaux")).toBe("/parametres/profil?ancre=reseaux");
    expect(settingHref("compte", "adresse")).toBe("/parametres/compte#adresse");
    expect(settingHref("notifications")).toBe("/parametres/notifications");
  });
});
