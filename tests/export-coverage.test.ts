import { readFileSync } from "node:fs";
import { getTableConfig, PgTable, pgTable, uuid } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "../src/lib/db/schema";
import { accountForExport, EXCLUDED_TABLES, EXPORTED_TABLES, tablesReferencing } from "../src/lib/export-coverage";

const route = readFileSync(new URL("../src/app/api/account/export/route.ts", import.meta.url), "utf8");
const tables = Object.entries(schema).filter(([, value]) => value instanceof PgTable) as [string, PgTable][];

describe("couverture de l'export RGPD", () => {
  it("chaque table liée à users.id est exportée ou exclue avec sa raison", () => {
    const linked = tablesReferencing(schema, schema.users);
    expect(linked.length).toBeGreaterThan(20);
    const forgotten = linked.filter((name) => !(name in EXPORTED_TABLES) && !(name in EXCLUDED_TABLES));
    expect(forgotten, `À ajouter à EXPORTED_TABLES ou EXCLUDED_TABLES (src/lib/export-coverage.ts) : ${forgotten.join(", ")}`).toEqual([]);
  });

  it("repère bien une nouvelle table qui référence un compte", () => {
    const added = pgTable("table_oubliee", { id: uuid("id"), owner: uuid("owner").references(() => schema.users.id) });
    expect(tablesReferencing({ added }, schema.users)).toEqual(["table_oubliee"]);
    expect(tablesReferencing({ documents: schema.documents, programs: schema.programs }, schema.users)).toEqual(["documents"]);
  });

  it("une exclusion a une raison, et une table n'est pas à la fois exportée et exclue", () => {
    for (const [name, reason] of Object.entries(EXCLUDED_TABLES)) {
      expect(reason.length, name).toBeGreaterThan(20);
      expect(name in EXPORTED_TABLES, name).toBe(false);
    }
  });

  it("les noms déclarés existent dans le schéma", () => {
    const names = new Set(tables.map(([, table]) => getTableConfig(table).name));
    for (const name of [...Object.keys(EXPORTED_TABLES), ...Object.keys(EXCLUDED_TABLES)]) expect(names.has(name), name).toBe(true);
  });

  it("la route lit vraiment chaque table et produit chaque rubrique", () => {
    for (const [key, table] of tables) {
      const name = getTableConfig(table).name;
      if (!(name in EXPORTED_TABLES)) continue;
      expect(route.includes(`${EXPORTED_TABLES[name as keyof typeof EXPORTED_TABLES]}:`), `rubrique de ${name}`).toBe(true);
      if (name !== "users") expect(route.includes(`schema.${key}.`), `requête sur ${name}`).toBe(true);
    }
  });
});

describe("secrets de l'export", () => {
  it("le compte ne contient ni mot de passe ni secret TOTP", () => {
    const out = accountForExport({ email: "a@b.c", passwordHash: "argon2", totpSecret: "v1:x", totpLastCounter: 12, totpEnabled: true });
    expect(out).toEqual({ email: "a@b.c", totpEnabled: true });
  });

  it("la route ne sélectionne aucune colonne secrète", () => {
    for (const secret of ["tokenHash", "codeHash", "publicKey", "credentialId", "trackingToken", "s3UploadId", "schema.oneTimeTokens", "schema.recoveryCodes"]) {
      expect(route.includes(secret), secret).toBe(false);
    }
    // Le corps d'un mail en attente peut contenir un lien de connexion
    expect(route.includes("schema.outbox.body")).toBe(false);
  });
});
