import "server-only";
import { alertAdminsDaily } from "./admin-alert";
import { DOWNLOAD_ALERT_PER_HOUR, DOWNLOADS_PER_HOUR, READ_ALERT_PER_HOUR, READS_PER_HOUR } from "./download-rules";
import { env } from "./env";
import { rateHit, rateLimited } from "./security";

export async function downloadRefusal(user: { id: string; name: string; email: string }) {
  const key = `download:${user.id}`;
  if (await rateLimited(key, DOWNLOADS_PER_HOUR, 60)) {
    return new Response("Tu as téléchargé beaucoup de fichiers en une heure. Réessaie dans un moment : la limite se libère au fil de l’heure.", {
      status: 429, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "600" },
    });
  }
  await rateHit(key);
  if (await rateLimited(key, DOWNLOAD_ALERT_PER_HOUR, 60)) {
    await alertAdminsDaily(`download:${user.id}`, {
      title: `${env.siteName} : pic de téléchargements`,
      body: `${user.name} (${user.email}) a téléchargé ${DOWNLOAD_ALERT_PER_HOUR} fichiers en moins d’une heure. Au-delà de ${DOWNLOADS_PER_HOUR}, ses téléchargements sont bloqués.`,
      href: `/admin/personnes/${user.id}`,
    }).catch((error) => console.warn("alerte de téléchargement :", (error as Error).message));
  }
  return null;
}

/** Anti-aspiration des pages de cours : true quand la limite horaire est atteinte (la page affiche alors une attente). */
export async function readingLimited(user: { id: string; name: string; email: string }) {
  const key = `read:${user.id}`;
  if (await rateLimited(key, READS_PER_HOUR, 60)) return true;
  await rateHit(key);
  if (await rateLimited(key, READ_ALERT_PER_HOUR, 60)) {
    await alertAdminsDaily(`read:${user.id}`, {
      title: `${env.siteName} : pic de lectures`,
      body: `${user.name} (${user.email}) a ouvert ${READ_ALERT_PER_HOUR} pages de cours en moins d’une heure. Au-delà de ${READS_PER_HOUR}, la lecture est suspendue pour l’heure.`,
      href: `/admin/personnes/${user.id}`,
    }).catch((error) => console.warn("alerte de lecture :", (error as Error).message));
  }
  return false;
}
