import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "src");
const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : /\.tsx$/.test(name) ? [path] : [];
});
const sources = files(SRC).map((path) => ({ path: path.slice(SRC.length + 1), text: readFileSync(path, "utf8") }));

describe("un lien reste un lien", () => {
  it("aucun Button rendu en <Link> ou <a> (nativeButton={false} lui donnait role=\"button\")", () => {
    const offenders = sources.filter(({ text }) => /<Button\b[^>]*render=\{<(Link|a)\b/.test(text)).map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
  it("nativeButton={false} seulement pour de vraies actions, chacune expliquée", () => {
    const uses = sources.flatMap(({ path, text }) => text.split("\n").flatMap((line, i, lines) =>
      line.includes("nativeButton={false}") && !/^(\/\/|\{\/\*)/.test(line.trim()) ? [{ path, explained: /nativeButton=\{false\}/.test(lines[i - 1] ?? "") }] : []));
    expect(uses.map((u) => u.path).sort()).toEqual(["components/hint.tsx", "components/profile/profile-editor.tsx"]);
    expect(uses.every((u) => u.explained)).toBe(true);
  });
});
