import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cleanImage, ImageRejected, nameForType } from "../src/lib/image-clean";

const solid = (width: number, height: number, channels: 3 | 4 = 3) => sharp({ create: { width, height, channels, background: channels === 4 ? { r: 200, g: 10, b: 10, alpha: 0.5 } : { r: 200, g: 10, b: 10 } } });
const EXIF = { IFD0: { ImageDescription: "chez-moi-secret", Copyright: "auteur-secret" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "48/1 51/1 24/1" } };

describe("cleanImage", () => {
  it("retire les EXIF et le GPS", async () => {
    const dirty = await solid(40, 30).withExif(EXIF).jpeg().toBuffer();
    expect((await sharp(dirty).metadata()).exif).toBeDefined();
    expect(dirty.includes("chez-moi-secret")).toBe(true);
    const { buffer, inlineType } = await cleanImage(dirty);
    expect(inlineType).toBe("image/jpeg");
    const meta = await sharp(buffer).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
    expect(buffer.includes("chez-moi-secret")).toBe(false);
    expect(buffer.includes("auteur-secret")).toBe(false);
  });

  it("applique l'orientation avant de la retirer", async () => {
    const turned = await solid(40, 20).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const meta = await sharp((await cleanImage(turned)).buffer).metadata();
    expect([meta.width, meta.height]).toEqual([20, 40]);
    expect(meta.orientation).toBeUndefined();
  });

  it("plafonne le grand côté sans agrandir", async () => {
    const big = await sharp((await cleanImage(await solid(3000, 1000).png().toBuffer())).buffer).metadata();
    expect([big.width, big.height]).toEqual([2400, 800]);
    const small = await sharp((await cleanImage(await solid(100, 50).png().toBuffer())).buffer).metadata();
    expect([small.width, small.height]).toEqual([100, 50]);
  });

  it("garde le PNG seulement s'il y a de la transparence", async () => {
    expect((await cleanImage(await solid(20, 20, 4).png().toBuffer())).inlineType).toBe("image/png");
    expect((await cleanImage(await solid(20, 20).png().toBuffer())).inlineType).toBe("image/webp");
    const opaqueAlpha = await sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } }).png().toBuffer();
    expect((await cleanImage(opaqueAlpha)).inlineType).toBe("image/webp");
    expect((await cleanImage(await solid(20, 20).webp().toBuffer())).inlineType).toBe("image/webp");
  });

  it("garde l'animation d'un GIF", async () => {
    const frame = (background: string) => sharp({ create: { width: 3000, height: 200, channels: 3, background } }).png().toBuffer();
    const gif = await sharp([await frame("red"), await frame("blue")], { join: { animated: true } }).gif().toBuffer();
    expect((await sharp(gif).metadata()).pages).toBe(2);
    const out = await cleanImage(gif);
    expect(out.inlineType).toBe("image/gif");
    const meta = await sharp(out.buffer).metadata();
    expect([meta.pages, meta.width, meta.height]).toEqual([2, 2400, 160]);
  });

  it("force le JPEG pour une photo de profil, sur fond blanc", async () => {
    const { buffer, inlineType } = await cleanImage(await solid(2000, 2000, 4).png().toBuffer(), { format: "jpeg", maxSide: 1024 });
    const meta = await sharp(buffer).metadata();
    expect(inlineType).toBe("image/jpeg");
    expect([meta.format, meta.width, meta.hasAlpha]).toEqual(["jpeg", 1024, false]);
  });

  it("refuse ce qui n'est pas une image lisible", async () => {
    await expect(cleanImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).rejects.toBeInstanceOf(ImageRejected);
    await expect(cleanImage(Buffer.from("%PDF-1.7 pas une image"))).rejects.toBeInstanceOf(ImageRejected);
    // La bonne signature ne suffit pas
    await expect(cleanImage(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]))).rejects.toBeInstanceOf(ImageRejected);
  });

  it("refuse une bombe d'image", async () => {
    const bomb = await sharp({ create: { width: 8000, height: 7000, channels: 3, background: "white" }, limitInputPixels: false }).png({ compressionLevel: 9 }).toBuffer();
    expect(bomb.length).toBeLessThan(8 * 1024 * 1024);
    await expect(cleanImage(bomb)).rejects.toBeInstanceOf(ImageRejected);
  });
});

describe("nameForType", () => {
  it("ajuste l'extension au format réel", () => {
    expect(nameForType("schema.png", "image/webp")).toBe("schema.webp");
    expect(nameForType("photo.JPEG", "image/jpeg")).toBe("photo.JPEG");
    expect(nameForType("image", "image/png")).toBe("image.png");
    expect(nameForType("plan.png", "image/png")).toBe("plan.png");
  });
});
