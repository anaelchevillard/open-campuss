import { z } from "zod";

// Le serveur écrit à cette adresse : fournie par le navigateur, elle ne doit jamais viser autre chose qu'un service de push
const PUSH_HOSTS = ["fcm.googleapis.com", "android.googleapis.com"];
const PUSH_SUFFIXES = [".push.apple.com", ".push.services.mozilla.com", ".notify.windows.com"];

export function isPushEndpoint(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  return PUSH_HOSTS.includes(url.hostname) || PUSH_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix) || url.hostname === suffix.slice(1));
}

const key = (max: number) => z.string().min(1).max(max).regex(/^[A-Za-z0-9_=-]+$/);

export const pushSubscriptionInput = z.object({
  endpoint: z.string().max(1024).refine(isPushEndpoint),
  keys: z.object({ p256dh: key(200), auth: key(100) }),
});

export const pushEndpointInput = z.object({ endpoint: z.string().max(1024) });

/** Un service de push exige un contact valide : l'adresse du site en production, un repli en développement. */
export const vapidSubject = (baseUrl: string) => (baseUrl.startsWith("https://") ? baseUrl : "mailto:contact@campuss.fr");

export function pushPayload(notification: { id: string; title: string; body: string; kind: string }) {
  return JSON.stringify({ title: notification.title, body: notification.body, url: `/notifications/ouvrir/${notification.id}`, tag: notification.kind });
}
