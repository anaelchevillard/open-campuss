"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "cn";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { PERIODS } from "@/lib/audience-calc";

const PERIOD_LABELS: Record<number, string> = { 7: "7 jours", 30: "30 jours", 90: "90 jours", 365: "12 mois" };

/** Période et filtres croisés (licence, année, matière) : tout vit dans l'URL, un lien garde la vue. */
export function StatsFilters({ days, programId, level, subjectId, programs, subjects }: {
  days: number; programId: number | null; level: number | null; subjectId: number | null;
  programs: { id: number; name: string }[]; subjects: { id: number; name: string; level: number }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const hrefWith = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const query = next.toString();
    return `${pathname}${query ? `?${query}` : ""}`;
  };
  const go = (patch: Record<string, string | null>) => start(() => router.replace(hrefWith(patch), { scroll: false }));
  return (
    <div className={cn("flex flex-wrap items-end gap-x-4 gap-y-3 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
      <div className="grid gap-1">
        <span className="text-xs text-muted-foreground" id="periode">Période</span>
        <div role="group" aria-labelledby="periode" className="flex gap-1 rounded-lg bg-muted p-0.5">
          {PERIODS.map((n) => (
            <Link key={n} href={hrefWith({ jours: n === 30 ? null : String(n) })} scroll={false} replace aria-current={n === days ? "true" : undefined}
              className={cn("rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors coarse:py-2.5", n === days ? "bg-card font-semibold text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}>
              {PERIOD_LABELS[n]}
            </Link>
          ))}
        </div>
      </div>
      <label className="grid gap-1">
        <span className="text-xs text-muted-foreground">Licence</span>
        <NativeSelect size="sm" value={programId ? String(programId) : "toutes"} onChange={(e) => go({ licence: e.target.value, matiere: null })}>
          <NativeSelectOption value="toutes">Toutes</NativeSelectOption>
          {programs.map((p) => <NativeSelectOption key={p.id} value={String(p.id)}>{p.name}</NativeSelectOption>)}
        </NativeSelect>
      </label>
      <label className="grid gap-1">
        <span className="text-xs text-muted-foreground">Année</span>
        <NativeSelect size="sm" value={level ? String(level) : ""} onChange={(e) => go({ annee: e.target.value || null, matiere: null })}>
          <NativeSelectOption value="">Toutes</NativeSelectOption>
          {[1, 2, 3].map((l) => <NativeSelectOption key={l} value={String(l)}>L{l}</NativeSelectOption>)}
        </NativeSelect>
      </label>
      <label className="grid min-w-0 gap-1">
        <span className="text-xs text-muted-foreground">Matière</span>
        <NativeSelect size="sm" className="max-w-64" value={subjectId ? String(subjectId) : ""} onChange={(e) => go({ matiere: e.target.value || null })}>
          <NativeSelectOption value="">Toutes</NativeSelectOption>
          {subjects.map((s) => <NativeSelectOption key={s.id} value={String(s.id)}>{level ? s.name : `L${s.level} · ${s.name}`}</NativeSelectOption>)}
        </NativeSelect>
      </label>
      {(level || subjectId || params.get("licence")) && (
        <Link href={hrefWith({ licence: null, annee: null, matiere: null })} replace scroll={false} className="py-1.5 text-sm text-link hover:underline">Retirer les filtres</Link>
      )}
    </div>
  );
}
