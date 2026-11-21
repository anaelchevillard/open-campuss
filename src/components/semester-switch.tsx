"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "cn";
import { SEMESTER_COOKIE, absoluteSemester, type Parity } from "@/lib/semester-rules";

function remember(parity: Parity) {
  document.cookie = `${SEMESTER_COOKIE}=${parity}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
}

/** S1 | S2 de l'année : l'URL (?semestre=) et un cookie retiennent le choix ; un point marque le semestre en cours. */
export function SemesterSwitch({ level, value, current, className }: { level: number; value: Parity; current: Parity; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, start] = useTransition();
  const choose = (parity: Parity) => {
    remember(parity);
    const next = new URLSearchParams(params);
    next.set("semestre", String(parity));
    start(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };
  return (
    <div role="radiogroup" aria-label="Semestre" className={cn("inline-flex rounded-lg bg-muted p-0.5", className)}>
      {([1, 2] as const).map((parity) => {
        const active = value === parity;
        return (
          <button key={parity} type="button" role="radio" aria-checked={active} onClick={() => choose(parity)}
            className={cn("relative flex min-h-8 items-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-colors coarse:min-h-10", active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}>
            S{absoluteSemester(level, parity)}
            {current === parity && <span className="size-1.5 rounded-full bg-success" aria-label="en cours" />}
          </button>
        );
      })}
    </div>
  );
}
