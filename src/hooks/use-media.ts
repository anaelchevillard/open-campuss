import * as React from "react"

/** Requête média lue côté client ; `false` au rendu serveur. */
export function useMedia(query: string) {
  const subscribe = React.useCallback((onChange: () => void) => {
    const mql = window.matchMedia(query)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [query])
  return React.useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}

/** Le comportement (survol, poignées, feuilles) suit le pointeur, jamais la largeur : un iPad avec souris a droit au survol. */
export const useCoarsePointer = () => useMedia("(pointer: coarse)")
