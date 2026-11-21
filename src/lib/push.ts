import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { env } from "./env";
import { vapidSubject } from "./push-endpoint";

const { pushSubscriptions } = schema;

/**
 * Écrit à tous les appareils de la personne et renvoie combien ont accepté.
 * 404 ou 410 : l'abonnement n'existe plus, on l'oublie. Le reste est une panne passagère.
 */
export async function pushToDevices(devices: (typeof pushSubscriptions.$inferSelect)[], payload: string) {
  if (!env.pushEnabled || !devices.length) return 0;
  const { default: webPush } = await import("web-push");
  const vapidDetails = { subject: vapidSubject(env.baseUrl), publicKey: env.vapidPublicKey, privateKey: env.vapidPrivateKey };
  let delivered = 0;
  for (const device of devices) {
    try {
      await webPush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, payload, { vapidDetails, TTL: 86_400, timeout: 10_000 });
      delivered += 1;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, device.endpoint));
      else console.warn("push : envoi en échec", status ?? (error as Error).message);
    }
  }
  return delivered;
}
