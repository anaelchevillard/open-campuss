import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { contentSecurityPolicy, strictTransportSecurity } from "@/lib/csp";
import { proxy } from "../src/proxy";

const BASE = "https://campuss.fr";
const CONTENT = "https://contenu.campuss.fr";
const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.split(" ")[0] === name);

describe("politique de sécurité", () => {
  const csp = contentSecurityPolicy({ nonce: "abc", dev: false, baseUrl: BASE, contentOrigin: CONTENT });

  it("n'autorise aucune image ni média d'un site quelconque", () => {
    expect(directive(csp, "img-src")).toBe("img-src 'self' data: https://i.ytimg.com");
    expect(directive(csp, "media-src")).toBe("media-src 'self'");
  });

  it("sépare les balises et les attributs de style, sans toucher aux scripts", () => {
    expect(directive(csp, "style-src-elem")).toBeDefined();
    expect(directive(csp, "style-src-attr")).toBe("style-src-attr 'unsafe-inline'");
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic'");
  });

  it("n'ouvre Cloudflare Turnstile que si ses clés sont posées", () => {
    expect(csp).not.toContain("challenges.cloudflare.com");
    const withCaptcha = contentSecurityPolicy({ nonce: "abc", dev: false, baseUrl: BASE, turnstile: true });
    expect(directive(withCaptcha, "script-src")).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic' https://challenges.cloudflare.com");
    expect(directive(withCaptcha, "frame-src")).toContain("https://challenges.cloudflare.com");
  });

  it("laisse les artefacts et YouTube dans un cadre", () => {
    expect(directive(csp, "frame-src")).toContain(CONTENT);
    expect(directive(csp, "frame-src")).toContain("https://www.youtube-nocookie.com");
  });
});

describe("WebAssembly (décodeur meshopt du téléphone 3D)", () => {
  // Vitest pose BASE_URL à « / » (variable de Vite) : on remet l'adresse du site
  beforeAll(() => { vi.stubEnv("BASE_URL", BASE); });
  afterAll(() => { vi.unstubAllEnvs(); });
  const cspOf = (path: string, cookie?: string) => proxy(new NextRequest(`https://campuss.fr${path}`, cookie ? { headers: { cookie } } : undefined)).headers.get("Content-Security-Policy") ?? "";

  it("n'est permis que sur la présentation, « / », nonce et strict-dynamic gardés", () => {
    const script = directive(cspOf("/"), "script-src") ?? "";
    expect(script).toMatch(/^script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic' 'wasm-unsafe-eval'$/);
    expect(script).not.toContain("'unsafe-eval'");
  });

  it("reste refusé partout ailleurs, connecté ou non", () => {
    for (const path of ["/accueil", "/presentation", "/presentation/telephone-2/telephone.gltf", "/presentation/", "/presentationx", "/accueil/", "/login", "/d/abc", "/admin/statistiques", "/parametres", "/credits", "/api/health"]) {
      for (const cookie of [undefined, "__Host-campus=jeton"]) {
        const csp = cspOf(path, cookie);
        if (!csp) continue; // fichiers servis avec leur propre politique
        expect(csp, path).not.toContain("wasm-unsafe-eval");
        expect(directive(csp, "script-src"), path).toMatch(/^script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'$/);
      }
    }
  });

  it("n'est jamais ajouté par défaut à la politique", () => {
    expect(contentSecurityPolicy({ nonce: "abc", dev: false, baseUrl: BASE })).not.toContain("wasm");
    expect(directive(contentSecurityPolicy({ nonce: "abc", dev: false, baseUrl: BASE, wasm: true }), "script-src")).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic' 'wasm-unsafe-eval'");
  });
});

describe("HSTS", () => {
  const value = "max-age=31536000; includeSubDomains; preload";

  it("s'applique au site et aux artefacts en HTTPS", () => {
    expect(strictTransportSecurity("campuss.fr", BASE, CONTENT)).toBe(value);
    expect(strictTransportSecurity("contenu.campuss.fr", BASE, CONTENT)).toBe(value);
  });

  it("ne s'applique ni en HTTP ni sur un autre hôte", () => {
    expect(strictTransportSecurity("localhost:3000", "http://localhost:3000")).toBeNull();
    expect(strictTransportSecurity("autre-site.example.org", BASE, CONTENT)).toBeNull();
    expect(strictTransportSecurity("192.168.1.5:3200", BASE)).toBeNull();
  });
});

describe("security.txt", () => {
  const text = readFileSync("public/.well-known/security.txt", "utf8");

  it("porte les champs de la RFC 9116", () => {
    expect(text).toMatch(/^Contact: https:\/\/campuss\.fr\/contact$/m);
    expect(text).toMatch(/^Expires: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/m);
    expect(text).toMatch(/^Preferred-Languages: fr$/m);
    expect(text).toMatch(/^Canonical: https:\/\/campuss\.fr\/\.well-known\/security\.txt$/m);
  });
});
