/** df compte l'espace réservé à root comme occupé : même calcul ici, pour que le pourcentage soit le même. */
export function diskPercent(stats: { blocks: number; bfree: number; bavail: number }) {
  const used = stats.blocks - stats.bfree;
  const total = used + stats.bavail;
  return total > 0 ? Math.round((used / total) * 100) : 0;
}

export const DISK_ALERT_PERCENT = 80;
const TMPFS = 0x01021994;
export const isMemoryDisk = (type: number) => type === TMPFS;
