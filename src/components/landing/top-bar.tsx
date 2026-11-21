"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";

export type Cta = { href: string; label: string } | null;
type Anchor = { href: string; label: string };

/**
 * Barre du haut : pleine largeur, au fond de la page, avec un filet dès qu'on a défilé. Ni verre dépoli ni trait de
 * lecture. Le logo recharge la page (lien <a>, jamais next/link vers « / ») : voir landing-fx et lib/csp.ts.
 * Au téléphone, l'action principale descend dans une barre collée en bas dès que le bouton du héros sort de l'écran,
 * et disparaît sur l'appel final.
 */
export function TopBar({ cta, anchors, signedIn = false }: { cta: Cta; anchors: Anchor[]; signedIn?: boolean }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [dock, setDock] = useState(false);

  useEffect(() => {
    const top = sentinel.current;
    if (!top) return;
    const bar = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    bar.observe(top);
    const hero = document.getElementById("hero-cta");
    const final = document.getElementById("final-cta");
    let heroGone = false, finalShown = false;
    const ctas = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === hero) heroGone = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        if (entry.target === final) finalShown = entry.isIntersecting;
      }
      setDock(heroGone && !finalShown);
    });
    [hero, final].forEach((el) => el && ctas.observe(el));
    return () => { bar.disconnect(); ctas.disconnect(); };
  }, []);

  return (
    <>
      <div ref={sentinel} aria-hidden="true" className="absolute inset-x-0 top-0 h-2" />
      {/* Collant et non fixe : sous la bande de consentement tant qu'elle est là (Refuser et Accepter jamais recouverts),
          puis en haut de l'écran une fois qu'elle a défilé. Hauteur nulle : le héros ne bouge pas. */}
      <div className="pointer-events-none sticky top-0 z-40 h-0">
      <header className={cn("lp-bar pointer-events-auto absolute inset-x-0 top-0", scrolled && "lp-bar-solid")}>
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-1 px-4 md:px-8">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- navigation complète voulue (CSP de la présentation) */}
          <a href="/" aria-label="Campuss, haut de la page" className="mr-auto inline-flex min-h-11 items-center rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"><Logo className="h-6 w-auto md:h-7" /></a>
          <nav aria-label="Sections" className="hidden items-center gap-0.5 lg:flex">
            {anchors.map((a) => <a key={a.href} href={a.href} className="lp-bar-link">{a.label}</a>)}
          </nav>
          {/* Connecté : pas de « Se connecter » ; au téléphone, où le bouton est masqué, un lien ouvre l'application */}
          {signedIn ? cta && <Link href={cta.href} className="lp-bar-link md:hidden">{cta.label}</Link> : <Link href="/login" className="lp-bar-link">Se connecter</Link>}
          {cta && <Link href={cta.href} data-slot="button" className={cn(buttonVariants(), "lp-cta ml-2 hidden h-10 rounded-full px-5 md:inline-flex")}>{cta.label}</Link>}
        </div>
      </header>
      </div>
      {cta && (
        <div
          inert={!dock}
          className={cn("fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-transform duration-200 md:hidden", dock ? "translate-y-0" : "pointer-events-none translate-y-full")}
        >
          <Link href={cta.href} data-slot="button" className={cn(buttonVariants(), "lp-cta h-12 w-full rounded-full text-base")}>{cta.label}</Link>
        </div>
      )}
    </>
  );
}
