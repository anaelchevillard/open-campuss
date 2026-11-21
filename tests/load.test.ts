import { describe, expect, it } from "vitest";
import { checkTarget, parseArgs, percentile, renderTable, summarize } from "./load/run.mjs";

describe("script de charge", () => {
  it("refuse la production sans drapeau explicite", () => {
    for (const url of ["https://campuss.fr", "https://CAMPUSS.fr/", "https://www.campuss.fr", "https://contenu.campuss.fr", "http://campuss.fr.", "https://campuss.fr:443/d"]) {
      expect(() => checkTarget(url), url).toThrow(/production/);
    }
    expect(checkTarget("https://campuss.fr", ["--viser-la-production"])).toBe("https://campuss.fr");
  });

  it("accepte le banc et n'en garde que l'origine", () => {
    expect(checkTarget("http://localhost:3100/peu/importe")).toBe("http://localhost:3100");
    expect(checkTarget("https://notcampuss.fr")).toBe("https://notcampuss.fr");
  });

  it("refuse une adresse illisible", () => {
    expect(() => checkTarget(undefined)).toThrow(/illisible/);
    expect(() => checkTarget("file:///etc/passwd")).toThrow(/Protocole/);
  });

  it("calcule médiane et p95 par rang", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 95)).toBe(95);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([], 95)).toBe(0);
  });

  it("compte à part les réponses qui ne sont pas des pages", () => {
    const row = summarize("/", [{ ms: 10, status: 200 }, { ms: 30, status: 307 }, { ms: 20, status: 200 }], 2);
    expect(row).toMatchObject({ requests: 3, failed: 1, median: 20, p95: 30, perSecond: 1.5 });
    expect(renderTable([row])).toContain("médiane");
  });

  it("lit ses options et refuse les autres", () => {
    expect(parseArgs(["http://x", "--concurrency", "4"])).toMatchObject({ base: "http://x", options: { concurrency: 4, requests: 200 } });
    expect(() => parseArgs(["http://x", "--inconnue", "1"])).toThrow(/inconnue/);
    expect(() => parseArgs(["http://x", "--requests", "0"])).toThrow(/positifs/);
  });
});
