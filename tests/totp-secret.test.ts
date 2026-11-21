import { describe, expect, it } from "vitest";
import { openTotpSecret, readTotpSecret, sealTotpSecret } from "../src/lib/totp-secret";

const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

describe("secret TOTP chiffré", () => {
  it("aller-retour, format versionné, tient dans la colonne", () => {
    const sealed = sealTotpSecret(SECRET);
    expect(sealed).toMatch(/^v1:[\w-]+:[\w-]+:[\w-]+$/);
    expect(sealed).not.toContain(SECRET);
    expect(sealed.length).toBeLessThanOrEqual(255);
    expect(openTotpSecret(sealed)).toBe(SECRET);
    expect(sealTotpSecret(SECRET)).not.toBe(sealed);
  });

  it("refuse une valeur altérée, sur chaque partie", () => {
    const [v, iv, tag, data] = sealTotpSecret(SECRET).split(":");
    const flip = (part: string) => { const bytes = Buffer.from(part, "base64url"); bytes[0] ^= 1; return bytes.toString("base64url"); };
    expect(() => openTotpSecret([v, flip(iv), tag, data].join(":"))).toThrow();
    expect(() => openTotpSecret([v, iv, flip(tag), data].join(":"))).toThrow();
    expect(() => openTotpSecret([v, iv, tag, flip(data)].join(":"))).toThrow();
    // Un tag raccourci rendrait la falsification facile
    expect(() => openTotpSecret([v, iv, tag.slice(0, 6), data].join(":"))).toThrow();
    expect(() => openTotpSecret(["v2", iv, tag, data].join(":"))).toThrow();
  });

  it("lit encore l'ancien format en clair", () => {
    expect(openTotpSecret(SECRET)).toBe(SECRET);
    expect(readTotpSecret(SECRET)).toBe(SECRET);
  });

  it("un secret illisible ne fait pas planter la connexion", () => {
    expect(readTotpSecret(null)).toBeNull();
    expect(readTotpSecret("v1:a:b:c")).toBeNull();
  });
});
