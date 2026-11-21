import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { documents } from "@/lib/db/schema";
import { publishRoute } from "@/lib/publish-rules";

// Un étudiant « de confiance » publiait directement. Un cours est désormais toujours relu
// avant publication, sauf pour l'administration, le délégué qui modère et l'enseignant dans ses matières.

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const files = sources("src").map((path) => ({ path, text: readFileSync(path, "utf8") }));

describe("aucune publication directe pour un étudiant", () => {
  it("un membre aux nombreux cours validés passe toujours par la relecture", () => {
    // Plus aucun paramètre de « confiance » : le nombre de cours validés n'entre pas dans la décision
    for (const role of ["member", "contributor"]) {
      expect(publishRoute({ role }, { canModerate: false, teacherOwnCourse: false })).toBe("review");
      expect(publishRoute({ role }, { canModerate: true, teacherOwnCourse: true })).toBe("review");
    }
  });

  it("la règle des auteurs de confiance a disparu du code", () => {
    for (const { path, text } of files) {
      expect(text, path).not.toMatch(/canPublishDirectly|isTrustedAuthor|isTrusted\(|TRUSTED_AFTER|trusted-rules|setDirectPublishing/);
    }
  });

  it("plus aucun chemin ne met un cours en ligne « à relire après coup »", () => {
    for (const { path, text } of files) expect(text, path).not.toMatch(/postReviewAt:\s*new Date\(\)/);
  });

  it("seuls les chemins gardés par un rôle écrivent published = true sur un document", () => {
    const writers = files.filter(({ text }) => text.split("\n").some((line) => /published:\s*true/.test(line) && /documents\)?\./.test(line) && /\.set\(/.test(line))).map((f) => f.path).sort();
    expect(writers).toEqual([
      "src/app/actions/admin/content.ts", // requireModerator + canModerate (publication groupée)
      "src/app/actions/admin/library.ts", // administration
      "src/app/actions/admin/reports.ts", // administration (signalement rouvert)
      "src/app/actions/course.ts", // enseignant dans sa matière seulement
      "src/app/actions/moderation.ts", // moderated() : canModerate
    ]);
    const course = files.find((f) => f.path === "src/app/actions/course.ts")!.text;
    const write = course.indexOf("published: true, publishedAt");
    const guard = course.indexOf('if (route === "teacher") {');
    expect(guard).toBeGreaterThan(0);
    expect(write).toBeGreaterThan(guard);
    expect(course.slice(guard, write)).not.toMatch(/\n {2}\}/);
  });

  it("un document créé sans valeur explicite n'est jamais publié", () => {
    const column = getTableConfig(documents).columns.find((c) => c.name === "published");
    expect(column?.default).toBe(false);
  });
});
