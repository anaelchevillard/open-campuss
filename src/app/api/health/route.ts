import { sql } from "drizzle-orm";
import { apiAdmin } from "@/lib/auth";
import { antivirusEnabled, pingAntivirus } from "@/lib/clamav";
import { db } from "@/lib/db";
import { diskUsage } from "@/lib/disk-alert";
import { json } from "@/lib/http";
import { storageReachable } from "@/lib/s3";

export const dynamic = "force-dynamic";

/**
 * Route publique, lue aussi par le contrôle de santé de Docker : seule la base décide de son code de réponse,
 * un stockage en panne ne doit pas faire redémarrer le site. Le détail n'est lisible que par un administrateur.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
  } catch {
    return json({ status: "unavailable" }, 503);
  }
  if (!(await apiAdmin().catch(() => null))) return json({ status: "ok" });
  const [storage, antivirus, disk] = await Promise.all([
    storageReachable(),
    antivirusEnabled() ? pingAntivirus() : null,
    diskUsage().catch(() => null),
  ]);
  return json({
    status: storage && antivirus !== false ? "ok" : "degraded",
    database: "ok",
    storage: storage ? "ok" : "unavailable",
    antivirus: antivirus === null ? "disabled" : antivirus ? "ok" : "unavailable",
    diskPercent: disk?.percent ?? null,
  });
}
