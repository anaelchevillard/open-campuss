"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useScroll, useMotionValueEvent } from "motion/react";
import { cn } from "cn";
import { IPhoneFrame } from "./frames";
import { can3d, isDarkTheme, isPhone } from "./calm";
import type { PhoneScene } from "./phone-3d";

export type HeroScreen = { key: string; label: string; shot: ReactNode };

/** Capture d'un écran pour la 3D : celle que la page a déjà chargée si elle est là, sinon le WebP 2x. */
function screenUrl(box: HTMLElement | null, key: string) {
  const img = box?.querySelector<HTMLImageElement>(`[data-screen="${key}"] img`);
  if (img?.complete && img.naturalWidth > 0 && img.currentSrc) return img.currentSrc;
  return `/presentation/${key}-${isDarkTheme() ? "dark" : "light"}@2x.webp`;
}

/** Le défilement du héros fait pivoter le téléphone : écouté seulement quand la 3D tourne. */
function ScrollDriver({ target, scene }: { target: RefObject<HTMLDivElement | null>; scene: RefObject<PhoneScene | null> }) {
  const { scrollYProgress } = useScroll({ target, offset: ["start start", "end start"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => scene.current?.setScroll(v));
  useEffect(() => { scene.current?.setScroll(scrollYProgress.get()); }, [scene, scrollYProgress]);
  return null;
}

/** Après le chargement de la page et au premier moment libre : la 3D ne dispute jamais le réseau ni le fil au premier affichage. */
function whenSettled(run: () => void) {
  let idle = 0;
  const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300));
  const schedule = () => { idle = ric(run, { timeout: 4000 }) as number; };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
  return () => {
    window.removeEventListener("load", schedule);
    (window.cancelIdleCallback ?? window.clearTimeout)(idle);
  };
}

/**
 * Le téléphone du héros. D'abord (et pour toujours en mouvement réduit, sans WebGL, en économie de données ou sur un
 * téléphone modeste) le téléphone dessiné en CSS avec la capture prioritaire ; puis, une fois visible et la page
 * chargée, le modèle 3D (three, chargé à la demande), qu'on fait tourner au doigt ou à la souris. Les boutons changent
 * l'écran dans les deux cas. Les autres captures ne se chargent qu'au premier choix.
 */
export function HeroPhone({ screens }: { screens: HeroScreen[] }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<PhoneScene | null>(null);
  const [index, setIndex] = useState(0);
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set([0]));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = box.current, cv = canvas.current;
    if (!el || !cv || !can3d()) return;
    let disposed = false, started = false;
    let cancelWait = () => {};
    const visible = { now: false };
    const start = () => {
      started = true;
      const lost = () => { setReady(false); scene.current?.dispose(); scene.current = null; };
      import("./phone-3d")
        .then(({ createPhoneScene }) => createPhoneScene(cv, { screen: screenUrl(el, screens[0].key), phone: isPhone(), onLost: lost }))
        .then((s) => {
          if (disposed) { s.dispose(); return; }
          scene.current = s;
          s.setActive(visible.now && !document.hidden);
          setReady(true);
        })
        .catch(() => undefined);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible.now = entry.isIntersecting;
      scene.current?.setActive(visible.now && !document.hidden);
      if (visible.now && !started) { started = true; cancelWait = whenSettled(start); }
    });
    io.observe(el);
    const onVisibility = () => scene.current?.setActive(visible.now && !document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      io.disconnect();
      cancelWait();
      document.removeEventListener("visibilitychange", onVisibility);
      scene.current?.dispose();
      scene.current = null;
    };
    // Les écrans viennent du serveur et ne changent pas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (i: number) => {
    if (i === index) return;
    setIndex(i);
    setSeen((s) => (s.has(i) ? s : new Set(s).add(i)));
    scene.current?.setScreen(screenUrl(box.current, screens[i].key));
  };

  return (
    <div className="flex flex-col items-center gap-5">
      <div ref={box} className="lp-phone-stage relative aspect-[3/4] w-full max-w-[30rem]" data-ready={ready || undefined}>
        {ready && <ScrollDriver target={box} scene={scene} />}
        <div className="lp-phone-fallback absolute inset-y-[7%] left-1/2 aspect-[100/207] -translate-x-1/2">
          <IPhoneFrame className="h-full w-full">
            {screens.map((s, i) => (
              <div key={s.key} data-screen={s.key} className={cn("absolute inset-0 transition-opacity duration-300", i === index ? "opacity-100" : "opacity-0")} aria-hidden={i !== index}>{seen.has(i) && s.shot}</div>
            ))}
          </IPhoneFrame>
        </div>
        <canvas ref={canvas} aria-hidden="true" className="lp-phone-canvas absolute inset-0 size-full" />
      </div>
      <div role="group" aria-label="Écran montré sur le téléphone" className="lp-chips relative z-10 flex flex-wrap justify-center gap-1.5">
        {screens.map((s, i) => (
          <button key={s.key} type="button" aria-pressed={i === index} onClick={() => choose(i)} className="lp-chip">{s.label}</button>
        ))}
      </div>
      <p aria-hidden="true" className={cn("lp-hint text-sm transition-opacity duration-500", ready ? "opacity-100" : "opacity-0")}>Attrape-le et fais-le tourner</p>
    </div>
  );
}
