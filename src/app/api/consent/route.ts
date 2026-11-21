import { and, eq, or } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { audit, currentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { json } from "@/lib/http";

const SIX_MONTHS = 183 * 86_400;

/** Accepter et refuser sont aussi simples l'un que l'autre, et le retrait efface le lien avec la personne. */
export async function POST(request: Request) {
  const body = z.object({ choice: z.enum(["yes", "no"]) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ error: "Choix invalide" }, 400);
  const store = await cookies();
  store.set("campuss-consent", body.data.choice, { secure: true, sameSite: "lax", path: "/", maxAge: SIX_MONTHS });
  const user = await currentUser();
  if (body.data.choice === "no") {
    const visitor = store.get("campuss-visitor")?.value;
    const links = [user ? eq(schema.pageViews.userId, user.id) : undefined, visitor && /^[0-9a-f-]{36}$/.test(visitor) ? eq(schema.pageViews.visitorId, visitor) : undefined].filter(Boolean);
    if (links.length) await db.update(schema.pageViews).set({ userId: null, visitorId: null }).where(and(or(...links)));
    store.delete({ name: "campuss-visitor", path: "/", secure: true, httpOnly: true, sameSite: "lax" });
    // Les événements produits liés à la personne partent aussi ; les totaux du jour, sans identifiant, restent
    if (user) await db.delete(schema.productEvents).where(eq(schema.productEvents.userId, user.id));
  }
  if (user) await db.update(schema.users).set({ trackingConsent: body.data.choice }).where(eq(schema.users.id, user.id));
  if (user) await audit(user.email, body.data.choice === "yes" ? "mesure_acceptée" : "mesure_refusée");
  return json({ ok: true });
}
