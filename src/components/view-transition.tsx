"use client";

import { usePathname } from "next/navigation";
import { useEffect, ViewTransition, type ReactNode } from "react";

// Le cours et l'éditeur ne glissent jamais : un déplacement remonte BlockNote et la couche d'annotations
const FADE_ONLY = /^\/(d|editer)\//;

/**
 * Transition de la zone principale entre deux pages (DESIGN.md §8.4) : glissement selon le sens (types nav-forward
 * et nav-back posés sur les liens), fondu sinon. Amélioration progressive : sans prise en charge, rien ne bouge.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const fadeOnly = FADE_ONLY.test(pathname);
  const enter = fadeOnly ? "fade" : { "nav-forward": "slide-forward", "nav-back": "slide-back", default: "fade" };
  return <ViewTransition enter={enter} exit={enter} default="none">{children}</ViewTransition>;
}

/** Le geste retour d'iOS anime déjà la page : on ne joue rien par-dessus. */
export function NativeBackGuard() {
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      if (!(event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition) return;
      const root = document.documentElement;
      root.classList.add("no-vt");
      window.setTimeout(() => root.classList.remove("no-vt"), 600);
    };
    window.addEventListener("popstate", onPop, true);
    return () => window.removeEventListener("popstate", onPop, true);
  }, []);
  return null;
}
