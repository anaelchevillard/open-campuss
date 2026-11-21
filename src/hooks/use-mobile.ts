import { useMedia } from "@/hooks/use-media"

/** Sous 1024 px : barre d'onglets en bas, pas de barre latérale. */
export const MOBILE_BREAKPOINT = 1024

export function useIsMobile() {
  return useMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
}
