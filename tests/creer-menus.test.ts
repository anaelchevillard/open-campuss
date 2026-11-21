import { existsSync } from "node:fs";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { createEntries } from "@/components/create-entries";
import { sidebarGroups, tabItems } from "@/components/nav/config";
import { reusableEmptyDraft } from "@/lib/empty-draft";
import type { Mode, Role } from "@/lib/modes";

/** Une adresse mène-t-elle à une page de src/app ? (sans segments dynamiques : ces menus n'en ont pas) */
const routeExists = (href: string) => {
  const path = new URL(href, "https://x").pathname.replace(/\/$/, "");
  return existsSync(`src/app${path}/page.tsx`) || existsSync(`src/app/(public)${path}/page.tsx`);
};

const ALL = { ai: true, notion: true, google: true, files: true };
const COUNTS = { toReview: 0, pending: 0, reports: 0, invites: 0, friends: 0, dueCards: 0 };

describe("Le + et les menus de création", () => {
  it("chaque entrée de « Commencer avec… » mène à une page qui existe, dans une matière ou non", () => {
    for (const subject of [undefined, "12"]) {
      const entries = createEntries(ALL, subject);
      expect(entries.map((e) => e.label)).toEqual(["Écrire", "Importer de Notion", "Importer de Google Docs", "Fichier", "Demander un cours", "Fiche mémo"]);
      for (const entry of entries) expect(routeExists(entry.href), entry.href).toBe(true);
      if (subject) for (const entry of entries) expect(new URL(entry.href, "https://x").searchParams.get("matiere")).toBe(subject);
    }
    expect(createEntries({ ai: false, notion: false, google: false, files: false }).map((e) => e.label)).toEqual(["Écrire", "Demander un cours", "Fiche mémo"]);
  });

  it("la page de rédaction ouverte ensuite existe", () => {
    expect(existsSync("src/app/editer/[id]/page.tsx")).toBe(true);
  });

  it("chaque onglet du téléphone et chaque lien de la barre latérale mène à une page qui existe", () => {
    const roles: Role[] = ["member", "contributor", "delegate", "teacher", "admin"];
    const modes: Mode[] = ["read", "edit", "admin", "teach"];
    for (const role of roles) for (const mode of modes) {
      for (const item of tabItems(mode, role, COUNTS)) if (item) expect(routeExists(item.href), `${mode}/${role} ${item.href}`).toBe(true);
      for (const group of sidebarGroups(mode, role, COUNTS)) for (const item of group.items) expect(routeExists(item.href), `${mode}/${role} ${item.href}`).toBe(true);
    }
  });

  it("un brouillon vide repris n'est jamais à la corbeille ni d'une autre licence (sinon « Page introuvable »)", () => {
    const { sql, params } = new PgDialect().sqlToQuery(reusableEmptyDraft("u-1", 3));
    expect(sql).toContain('"documents"."deleted_at" is null');
    expect(sql).toContain('"documents"."program_id" = $');
    expect(sql).toContain('"documents"."created_by" = $');
    expect(params).toContain("u-1");
    expect(params).toContain(3);
  });
});
