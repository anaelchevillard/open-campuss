"use client";

import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Compteur qui monte jusqu'à sa valeur quand il devient visible. Le serveur rend la valeur finale (lisible sans
 * JavaScript, juste pour les lecteurs d'écran) ; l'animation ne part qu'après l'hydratation, et pas en mouvement réduit.
 */
export function CountUp({ value }: { value: number }) {
  const count = useMotionValue(value);
  const text = useTransform(count, (v) => Math.round(v).toLocaleString("fr-FR"));
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!seen || reduce) { count.set(value); return; }
    count.set(0);
    const controls = animate(count, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [seen, value, count, reduce]);
  return <motion.span ref={ref} className="tabular-nums">{text}</motion.span>;
}

/** Barre qui se remplit quand elle devient visible. */
export function GrowBar({ percent, className = "h-2" }: { percent: number; className?: string }) {
  return (
    <div aria-hidden="true" className={`overflow-hidden rounded-full bg-muted ${className}`}>
      <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} whileInView={{ width: `${percent}%` }} viewport={{ once: true }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
    </div>
  );
}

/** Apparition à l'arrivée dans l'écran, pour les blocs situés plus bas dans la page. */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -8% 0px" }} transition={{ duration: 0.38, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}
