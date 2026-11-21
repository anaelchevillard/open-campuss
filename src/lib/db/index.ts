import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import * as schema from "./schema";

const globals = globalThis as unknown as { campusDb?: NodePgDatabase<typeof schema> };

function connect() {
  // 10 connexions au plus (Postgres en accepte 100, et la VM est petite). Les connexions inutilisées restent ouvertes
  // 5 minutes au lieu de 10 s, et deux restent toujours prêtes : une page après un moment de calme ne paie plus
  // l'ouverture d'une connexion (TCP + authentification SCRAM). Une connexion est renouvelée au bout d'une heure.
  const pool = new Pool({
    connectionString: env.databaseUrl, max: 10, min: 2, idleTimeoutMillis: 300_000, maxLifetimeSeconds: 3600,
    statement_timeout: 60_000, application_name: "campuss-web",
  });
  return drizzle(pool, { schema });
}

export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_, property) {
    globals.campusDb ??= connect();
    const value = Reflect.get(globals.campusDb, property);
    return typeof value === "function" ? value.bind(globals.campusDb) : value;
  },
});

export { schema };
