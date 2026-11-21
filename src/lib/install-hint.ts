export type InstallGuide = "ios" | "prompt" | "android" | null;

/** Un iPad récent se présente comme un Mac : seul le tactile le trahit. */
export function installGuide(device: { userAgent: string; maxTouchPoints: number; hasPrompt: boolean }): InstallGuide {
  if (/iPhone|iPad|iPod/.test(device.userAgent) || (/Macintosh/.test(device.userAgent) && device.maxTouchPoints > 1)) return "ios";
  if (device.hasPrompt) return "prompt";
  if (/Android/.test(device.userAgent)) return "android";
  return null;
}

export const INSTALL_AFTER_VISITS = 3;

export type InstallMemory = { visits: number; shown: boolean; showingNow: boolean };

/** Une seule fois : déjà montré, il ne reste affiché que pendant la visite en cours. */
export const shouldOfferInstall = (memory: InstallMemory, standalone: boolean) =>
  !standalone && (memory.showingNow || (!memory.shown && memory.visits >= INSTALL_AFTER_VISITS));
