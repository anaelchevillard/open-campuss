"use client"

import * as React from "react"

// Une seule bordure IA animée à l'écran : le premier élément au travail tient la place, les autres restent fixes
let holder: symbol | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const queue: symbol[] = []

/**
 * Pose `data-offscreen` hors de l'écran (animation en pause) et `data-still` quand un autre élément IA travaille déjà.
 * `const [ref, still] = useAiAnimationSlot(busy)` puis `ref={ref} data-still={still}` sur l'élément qui porte `ai-border`.
 */
export function useAiAnimationSlot<T extends HTMLElement>(busy = false) {
  const ref = React.useRef<T>(null)
  const me = React.useMemo(() => Symbol("ai"), [])
  const current = React.useSyncExternalStore(subscribe, () => holder, () => null)

  React.useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver(([entry]) => { el.toggleAttribute("data-offscreen", !entry.isIntersecting) })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  React.useEffect(() => {
    if (!busy) return
    queue.push(me)
    if (!holder) { holder = me; emit() }
    return () => {
      queue.splice(queue.indexOf(me), 1)
      if (holder === me) { holder = queue[0] ?? null; emit() }
    }
  }, [busy, me])

  return [ref, current !== null && current !== me ? "" : undefined] as const
}
