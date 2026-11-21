import { describe, expect, it } from "vitest";
import { visitorAddress } from "@/lib/visitor";

const from = (headers: Record<string, string>) => (name: string) => headers[name] ?? null;

describe("adresse du visiteur", () => {
  it("ignore un en-tête Cloudflare écrit par le client tant qu'il n'est pas activé", () => {
    expect(visitorAddress(from({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9, 5.6.7.8" }), "")).toBe("5.6.7.8");
  });
  it("lit l'en-tête de Cloudflare une fois activé", () => {
    expect(visitorAddress(from({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "5.6.7.8" }), "cf-connecting-ip")).toBe("1.2.3.4");
    expect(visitorAddress(from({ "cf-connecting-ip": "2a01:cb00::1" }), "cf-connecting-ip")).toBe("2a01:cb00::1");
  });
  it("retombe sur Traefik pour un accès local, et refuse ce qui n'est pas une adresse", () => {
    expect(visitorAddress(from({ "x-forwarded-for": "192.168.1.100" }), "cf-connecting-ip")).toBe("192.168.1.100");
    expect(visitorAddress(from({ "cf-connecting-ip": "<script>", "x-forwarded-for": "5.6.7.8" }), "cf-connecting-ip")).toBe("5.6.7.8");
    expect(visitorAddress(from({ "x-forwarded-for": "pas une adresse" }), "")).toBe("");
  });
});
