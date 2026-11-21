"use client";

import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "cn";
import { Icon } from "@/components/icon";
import { EASE_OUT, reward } from "@/lib/motion";
import { IconRestDay, IconStreak } from "@/lib/icons";
import type { WeekDay } from "@/lib/study-habits";

/** Anneau d'objectif : se remplit à l'arrivée et à chaque progrès (600 ms) ; instantané en mouvement réduit. */
export function GoalRing({ value, goal, size = 120, stroke = 10, className, children, label }: { value: number; goal: number; size?: number; stroke?: number; className?: string; children?: React.ReactNode; label?: string }) {
  const ratio = Math.min(1, goal > 0 ? value / goal : 0);
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const ref = useRef<SVGSVGElement>(null);
  const seen = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const done = ratio >= 1;
  return (
    <div className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg ref={ref} width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={label ?? `${value} sur ${goal} aujourd’hui`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} strokeLinecap="round"
          className={done ? "stroke-[var(--success)]" : "stroke-primary"}
          strokeDasharray={length}
          initial={{ strokeDashoffset: reduce ? length * (1 - ratio) : length }}
          animate={{ strokeDashoffset: seen || reduce ? length * (1 - ratio) : length }}
          transition={reduce ? { duration: 0 } : { duration: 0.6, ease: EASE_OUT }}
        />
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center text-center">{children}</div>}
    </div>
  );
}

/** Chiffre qui roule d'une valeur à l'autre ; le chiffre seul en mouvement réduit. */
export function RollingNumber({ value, from, className }: { value: number; from?: number; className?: string }) {
  const count = useMotionValue(from ?? value);
  const text = useTransform(count, (v) => Math.round(v).toLocaleString("fr-FR"));
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) { count.set(value); return; }
    const controls = animate(count, value, { duration: 0.8, ease: EASE_OUT });
    return () => controls.stop();
  }, [value, count, reduce]);
  return <motion.span className={cn("tabular-nums", className)}>{text}</motion.span>;
}

/** Flamme de série : grossit d'un coup quand la série prend un jour (ressort), le chiffre roule. */
export function StreakFlame({ streak, from, size = 24, className, lit }: { streak: number; from?: number; size?: 16 | 20 | 24 | 32; className?: string; lit?: boolean }) {
  const reduce = useReducedMotion();
  const grew = from !== undefined && streak > from;
  const on = lit ?? streak > 0;
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-semibold", className)}>
      <motion.span
        key={grew ? `grew-${streak}` : "still"}
        initial={grew && !reduce ? { scale: 1 } : false}
        animate={grew && !reduce ? { scale: [1, 1.25, 1] } : undefined}
        transition={{ ...reward, delay: 0.35 }}
        className={on ? "text-brand-text" : "text-muted-foreground"}
      >
        <Icon icon={IconStreak} size={size} filled={on} />
      </motion.span>
      <RollingNumber value={streak} from={from} />
    </span>
  );
}

const WEEK_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];
const STATE_LABEL: Record<WeekDay["state"], string> = { done: "révisé", rest: "jour de repos", vacation: "vacances", today: "aujourd’hui", future: "à venir", off: "pas révisé" };

/** La semaine en cours : jours révisés (flamme), repos et vacances (flocon), jamais de croix rouge. */
export function WeekStrip({ week, className }: { week: WeekDay[]; className?: string }) {
  return (
    <ol className={cn("grid grid-cols-7 gap-1", className)} aria-label="Cette semaine">
      {week.map((day, index) => (
        <li key={day.day} className="grid justify-items-center gap-1" aria-label={`${WEEK_LETTERS[index]} : ${STATE_LABEL[day.state]}`}>
          <span className={cn(
            "grid size-8 place-items-center rounded-full",
            day.state === "done" && "bg-brand-tint text-brand-text",
            (day.state === "rest" || day.state === "vacation") && "bg-info-tint text-info-foreground",
            day.state === "today" && "ring-2 ring-inset ring-border text-muted-foreground",
            (day.state === "future" || day.state === "off") && "bg-muted text-muted-foreground",
          )}>
            {day.state === "done" ? <Icon icon={IconStreak} size={16} filled /> : day.state === "rest" || day.state === "vacation" ? <Icon icon={IconRestDay} size={16} /> : null}
          </span>
          <span className="text-xs text-muted-foreground">{WEEK_LETTERS[index]}</span>
        </li>
      ))}
    </ol>
  );
}

/** Barre de progression fine qui glisse à chaque pas. */
export function ThinProgress({ value, className, label }: { value: number; className?: string; label: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}>
      <motion.div className="h-full origin-left rounded-full bg-primary" initial={false} animate={{ scaleX: Math.max(0, Math.min(1, value / 100)) }} transition={{ duration: 0.3, ease: EASE_OUT }} />
    </div>
  );
}
