import "server-only";
import { env } from "@/lib/env";
import { featureOn } from "@/lib/site-settings";

/** Tout point IA s'en sert : sans clé ou fonction coupée par l'administration, il disparaît (jamais grisé). */
export async function aiAvailable() {
  return Boolean(env.aiApiKey) && (await featureOn("ai"));
}
