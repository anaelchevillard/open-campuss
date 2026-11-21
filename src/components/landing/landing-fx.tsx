"use client";

import { useEffect } from "react";
import type Lenis from "lenis";
import { hasFinePointer, isCalm } from "./calm";
import { darkMedia } from "./shot";

/** Barre du haut : les ancres et le récit épinglé visent sous elle. */
const HEADER_OFFSET = 88;

let lenis: Lenis | null = null;

/** Défile jusqu'à une position : par Lenis s'il tourne, sinon natif (instantané en mouvement réduit). */
export function scrollToY(y: number) {
  if (lenis) lenis.scrollTo(y, { duration: 1.1 });
  else window.scrollTo({ top: y, behavior: isCalm() ? "auto" : "smooth" });
}

/** Ancre de la page : défile sous la barre, puis donne le focus à la section (lecteurs d'écran, clavier). */
function goToAnchor(target: HTMLElement) {
  const done = () => {
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  };
  if (lenis) lenis.scrollTo(target, { offset: -HEADER_OFFSET, duration: 1.2, onComplete: done });
  else { target.scrollIntoView({ behavior: isCalm() ? "auto" : "smooth" }); done(); }
  history.replaceState(null, "", `#${target.id}`);
}

/** Apparitions : un seul observateur pour tous les .lp-reveal ; sans JavaScript ou en mouvement réduit, tout est là. */
function watchReveals(root: HTMLElement) {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      (entry.target as HTMLElement).dataset.shown = "";
      io.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -8% 0px" });
  root.querySelectorAll(".lp-reveal").forEach((el) => io.observe(el));
  return () => io.disconnect();
}

/**
 * Captures au thème de la page : quand le thème change sur la page (réglages de lecture du pied de page), les sources
 * sombres suivent la classe de <html>. Le système reste la règle tant qu'aucun thème n'est choisi.
 */
function watchTheme(root: HTMLElement) {
  const html = document.documentElement;
  const sync = () => {
    const media = darkMedia(html.classList.contains("dark") ? "dark" : html.classList.contains("light") ? "light" : null);
    root.querySelectorAll<HTMLSourceElement>('source[data-theme="dark"]').forEach((el) => { if (el.media !== media) el.media = media; });
  };
  const mo = new MutationObserver(sync);
  mo.observe(html, { attributes: true, attributeFilter: ["class"] });
  sync();
  return () => mo.disconnect();
}

/** Moteur de la page : défilement fluide (Lenis), ancres, apparitions et thème des captures. */
export function LandingFx() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".lp-root");
    if (!root) return;
    const calm = isCalm();
    const cleanups: (() => void)[] = [watchTheme(root)];
    if (!calm) {
      root.dataset.fx = "";
      cleanups.push(watchReveals(root));
      // Souris et trackpad seulement : pas de Lenis au toucher (il tournerait à chaque image pour rien, le défilement
      // natif du système est déjà fluide). Plus aucun effet lié au pointeur (halo, parallaxe, aimant).
      if (hasFinePointer()) {
        let cancelled = false;
        import("lenis").then(({ default: Lenis }) => {
          if (cancelled) return;
          lenis = new Lenis({ autoRaf: true, lerp: 0.09, wheelMultiplier: 1, syncTouch: false });
        }).catch(() => undefined);
        cleanups.push(() => { cancelled = true; lenis?.destroy(); lenis = null; });
      }
    }
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#"]') : null;
      const target = link && link.hash.length > 1 ? document.getElementById(decodeURIComponent(link.hash.slice(1))) : null;
      if (!target) return;
      event.preventDefault();
      goToAnchor(target);
    };
    document.addEventListener("click", onClick);
    cleanups.push(() => document.removeEventListener("click", onClick));
    return () => { cleanups.forEach((fn) => fn()); delete root.dataset.fx; };
  }, []);
  return null;
}
