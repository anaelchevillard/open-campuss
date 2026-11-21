"use client";

import { useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from "react";
import { motion, useMotionValue, useMotionValueEvent, useScroll, useTransform, type MotionValue } from "motion/react";
import { IPhoneFrame } from "./frames";
import { scrollToY } from "./landing-fx";

export type StoryStep = { key: string; kicker: string; title: string; text: string; screen: ReactNode };

/** Part de l'étape `i` déjà parcourue (0 → 1), pour remplir son trait. */
function StepRail({ progress, i, n }: { progress: MotionValue<number>; i: number; n: number }) {
  const fill = useTransform(progress, [i / n, (i + 1) / n], [0, 1], { clamp: true });
  return <motion.span aria-hidden="true" style={{ scaleY: fill }} className="lp-story-fill" />;
}

/**
 * Le récit : sur grand écran, un iPhone reste à l'écran pendant que le défilement fait avancer les étapes, et son
 * écran change à chaque étape. Chaque étape est aussi un bouton qui y mène. Au téléphone et sur les écrans bas,
 * les étapes s'empilent, chacune avec sa capture.
 */
/** Même condition que landing.css (.lp-story-track) : le récit n'est épinglé que sur un écran large et assez haut. */
const PINNED = "(min-width: 1024px) and (min-height: 640px)";
const subscribePinned = (cb: () => void) => { const mq = window.matchMedia(PINNED); mq.addEventListener("change", cb); return () => mq.removeEventListener("change", cb); };

/** Suit le défilement du récit épinglé ; monté seulement quand il est affiché (rien à écouter au téléphone). */
function StoryDriver({ track, progress, onStep, n }: { track: RefObject<HTMLDivElement | null>; progress: MotionValue<number>; onStep: (i: number) => void; n: number }) {
  const { scrollYProgress } = useScroll({ target: track, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => { progress.set(v); onStep(Math.min(n - 1, Math.max(0, Math.floor(v * n)))); });
  return null;
}

export function Story({ steps }: { steps: StoryStep[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const n = steps.length;
  const pinned = useSyncExternalStore(subscribePinned, () => window.matchMedia(PINNED).matches, () => false);
  const scrollYProgress = useMotionValue(0);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    scrollToY(top + ((i + 0.5) / n) * (el.offsetHeight - window.innerHeight));
  };

  return (
    <>
      {/* Grand écran : épinglé */}
      {pinned && <StoryDriver track={track} progress={scrollYProgress} onStep={setActive} n={n} />}
      <div ref={track} className="lp-story-track hidden" style={{ "--steps": n } as CSSProperties}>
        <div className="lp-story-pin">
          <ol className="lp-story-steps">
            {steps.map((s, i) => (
              <li key={s.key} data-active={i === active || undefined}>
                <StepRail progress={scrollYProgress} i={i} n={n} />
                <button type="button" onClick={() => go(i)} aria-current={i === active ? "step" : undefined} className="lp-story-step">
                  <span className="lp-kicker">{s.kicker}</span>
                  <span className="lp-story-title">{s.title}</span>
                  <span className="lp-story-text"><span>{s.text}</span></span>
                </button>
              </li>
            ))}
          </ol>
          <div className="lp-story-device">
            <IPhoneFrame className="w-full">
              {steps.map((s, i) => (
                <div key={s.key} className="lp-story-screen" data-state={i === active ? "on" : i < active ? "past" : "next"} aria-hidden={i !== active}>{s.screen}</div>
              ))}
            </IPhoneFrame>
          </div>
        </div>
      </div>

      {/* Téléphone et écrans bas : empilé */}
      <ol className="lp-story-stack grid gap-12 md:grid-cols-2 md:gap-x-10 md:gap-y-16">
        {steps.map((s, i) => (
          <li key={s.key} className="lp-reveal grid justify-items-start gap-6 border-t border-border pt-6" style={{ "--i": i % 2 } as CSSProperties}>
            <div className="w-[min(62vw,15rem)]"><IPhoneFrame className="w-full"><div className="lp-story-screen" data-state="on">{s.screen}</div></IPhoneFrame></div>
            <div className="max-w-[34ch]">
              <p className="lp-kicker">{s.kicker}</p>
              <h3 className="lp-h3 mt-2">{s.title}</h3>
              <p className="mt-2 text-muted-foreground">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
