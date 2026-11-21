"use client"

import * as React from "react"

/**
 * Une surface superposée (feuille, palette, visionneuse) pousse une entrée d'historique à l'ouverture :
 * le retour système (Android, geste iOS, bouton du navigateur) la ferme au lieu de quitter la page.
 * `linkProps` se pose sur les liens de la surface : la page visée remplace l'entrée de la feuille.
 */
export function useBackToClose(open: boolean, onClose: () => void) {
  const close = React.useRef(onClose)
  const navigating = React.useRef(false)
  React.useEffect(() => { close.current = onClose })

  React.useEffect(() => {
    if (!open) return
    const id = Math.random().toString(36).slice(2)
    let pushed = false
    const onPop = () => {
      if ((window.history.state as { __surface?: string } | null)?.__surface === id) return
      pushed = false
      close.current()
    }
    // Différé : le double montage du mode strict ne doit pas empiler deux entrées
    const timer = window.setTimeout(() => {
      window.history.pushState({ __surface: id }, "")
      pushed = true
      window.addEventListener("popstate", onPop)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("popstate", onPop)
      const ours = (window.history.state as { __surface?: string } | null)?.__surface === id
      if (pushed && ours && !navigating.current) window.history.back()
      navigating.current = false
    }
  }, [open])

  const markNavigating = React.useCallback(() => { navigating.current = true }, [])
  const linkProps = React.useMemo(() => ({ replace: true, onClick: markNavigating }), [markNavigating])
  return { linkProps, markNavigating }
}
