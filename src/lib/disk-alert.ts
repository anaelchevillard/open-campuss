import "server-only";
import { statfs } from "node:fs/promises";
import { alertAdminsDaily } from "./admin-alert";
import { DISK_ALERT_PERCENT, diskPercent, isMemoryDisk } from "./disk";
import { env } from "./env";

/** Le dossier de travail est un montage de la VM, sur le même disque que MinIO et la base. Sinon, null plutôt qu'un chiffre faux. */
export async function diskUsage() {
  const stats = await statfs(env.tmpDir);
  if (isMemoryDisk(Number(stats.type))) return null;
  return { percent: diskPercent(stats), freeBytes: stats.bavail * stats.bsize };
}

export async function checkDisk() {
  const disk = await diskUsage().catch(() => null);
  if (!disk) {
    console.warn(`disque : ${env.tmpDir} ne permet pas de mesurer le stockage, pas d’alerte possible`);
    return;
  }
  if (disk.percent < DISK_ALERT_PERCENT) return;
  await alertAdminsDaily("disk", {
    title: `${env.siteName} : disque rempli à ${disk.percent} %`,
    body: `Il reste ${Math.floor(disk.freeBytes / 1024 ** 3)} Go sur le disque du stockage. Au-delà, les envois et la base risquent d’échouer.`,
    href: "/admin",
  });
}
