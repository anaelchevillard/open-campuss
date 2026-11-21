"use client";

import { useEffect, useRef, useState } from "react";
import { HEAT_CELL, HEAT_DEFAULT_WEEKS, HEAT_GAP, heatDays, heatWeeks } from "@/lib/heat-grid";
import { parisDay, shiftDay } from "@/lib/study-habits";

const LEVEL_FILL = ["fill-muted", "fill-[color-mix(in_oklab,var(--primary)_30%,var(--muted))]", "fill-[color-mix(in_oklab,var(--primary)_55%,var(--muted))]", "fill-[color-mix(in_oklab,var(--primary)_80%,var(--muted))]", "fill-primary"];

/**
 * Carte de chaleur de régularité : remplit toute la largeur du panneau. Le nombre de semaines suit la largeur
 * (10 à 53), les cases gardent une taille proche de 15 px ; avant la mesure, 18 semaines étirées sur la largeur.
 */
export function HeatMap({ heat, goal }: { heat: Record<string, number>; goal: number }) {
  const box = useRef<HTMLElement>(null);
  const [weeks, setWeeks] = useState(HEAT_DEFAULT_WEEKS);
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const measure = () => setWeeks(heatWeeks(node.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const today = parisDay(new Date());
  const days = heatDays(today, weeks, shiftDay);
  const level = (n: number) => (n <= 0 ? 0 : n < goal / 2 ? 1 : n < goal ? 2 : n < goal * 2 ? 3 : 4);
  const active = days.filter((day) => (heat[day] ?? 0) > 0).length;
  const step = HEAT_CELL + HEAT_GAP;
  return (
    <figure ref={box} className="grid min-w-0 gap-2">
      <svg viewBox={`0 0 ${weeks * step - HEAT_GAP} ${7 * step - HEAT_GAP}`} className="block h-auto w-full" role="img" aria-label={`${active} jours révisés sur les ${weeks} dernières semaines`}>
        {days.map((day, i) => (
          <rect key={day} x={Math.floor(i / 7) * step} y={(i % 7) * step} width={HEAT_CELL} height={HEAT_CELL} rx={3} className={LEVEL_FILL[level(heat[day] ?? 0)]}>
            <title>{`${new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} : ${heat[day] ?? 0}`}</title>
          </rect>
        ))}
      </svg>
      <figcaption className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{active} {active > 1 ? "jours" : "jour"} en {weeks} semaines</span>
        <span className="ml-auto flex items-center gap-1" aria-hidden>Moins{LEVEL_FILL.map((fill) => <svg key={fill} viewBox="0 0 10 10" className="size-2.5"><rect width="10" height="10" rx="2" className={fill} /></svg>)}Plus</span>
      </figcaption>
    </figure>
  );
}
