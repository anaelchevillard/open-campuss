import "server-only";
import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { parisDay } from "@/lib/audience-calc";
import { db, schema } from "@/lib/db";
import { takeSlot, type Window } from "@/lib/errors/limit";
import { consentOf, eventWrites, type ProductEvent } from "@/lib/product-event-catalog";

export { PRODUCT_EVENTS, type ProductEvent } from "@/lib/product-event-catalog";

/** Une personne qui répète une action en boucle ne gonfle pas les courbes : 60 fois par heure et par événement. */
const recent: Window = new Map();
const PER_HOUR = 60;

type Who = { id: string; trackingConsent?: string | null };

async function cookieConsent() {
  try {
    return (await cookies()).get("campuss-consent")?.value ?? null;
  } catch {
    return null; // hors d'une requête (tâche de fond) : pas de cookie, donc pas d'accord
  }
}

async function accountConsent(who: Who) {
  if (who.trackingConsent !== undefined) return who.trackingConsent;
  const [row] = await db.select({ consent: schema.users.trackingConsent }).from(schema.users).where(eq(schema.users.id, who.id)).limit(1);
  return row?.consent ?? null;
}

/**
 * Événement produit, appelé côté serveur là où l'action a réussi. Toujours compté dans le total du
 * jour, sans identifiant ; lié à la personne seulement si elle a accepté la mesure d'audience (compte, sinon cookie de
 * cet appareil). Ne lève jamais : une mesure ne doit pas faire échouer l'action.
 */
export async function trackEvent(name: ProductEvent, who: Who | null) {
  try {
    if (!takeSlot(recent, `${who?.id ?? "anonyme"}:${name}`, who ? PER_HOUR : 10_000, 3_600_000, Date.now(), 20_000)) return;
    const consented = who ? consentOf(await accountConsent(who), await cookieConsent()) : false;
    const writes = eventWrites(name, who?.id ?? null, consented);
    const t = schema.productEventCounts;
    await db.insert(t).values({ day: parisDay(new Date()), name: writes.daily.name, n: 1 })
      .onConflictDoUpdate({ target: [t.day, t.name], set: { n: sql`${t.n} + 1` } });
    if (writes.individual) await db.insert(schema.productEvents).values(writes.individual);
  } catch (error) {
    console.error("événement non enregistré", name, error instanceof Error ? error.message : error);
  }
}
