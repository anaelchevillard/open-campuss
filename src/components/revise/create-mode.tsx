import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";
import { Icon } from "@/components/icon";
import { PageTitle } from "@/components/page-title";
import { toRoman } from "@/lib/roman";
import { IconAdd, IconCards, IconClose } from "@/lib/icons";

const STEPS = ["Choisir un cours", "Générer ou écrire", "Réviser"] as const;

/**
 * On voit qu'on est en train de créer des fiches, pas dans la liste des cours.
 * Bandeau de mode (icône fiches, « Créer des fiches », sortie), étapes numérotées, puis le contenu de l'étape.
 */
export function CreateModeHeader({ step, lead, exitHref = "/reviser/fiches" }: { step: 1 | 2 | 3; lead?: ReactNode; exitHref?: string }) {
  return (
    <header className="mb-8 grid gap-5">
      <PageTitle title="Créer des fiches" />
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand-text"><Icon icon={IconCards} size={24} /></span>
        <div className="grid min-w-0 flex-1 gap-1">
          <p className="text-sm font-semibold text-brand-text">Mode création</p>
          <h1 className="title wrap-break-word">Créer des fiches</h1>
          {lead && <p className="max-w-[62ch] text-pretty text-muted-foreground">{lead}</p>}
        </div>
        <Link href={exitHref} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground" aria-label="Quitter la création de fiches">
          <Icon icon={IconClose} size={16} /><span className="hidden sm:inline">Quitter</span>
        </Link>
      </div>
      <ol aria-label="Étapes" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {STEPS.map((label, index) => {
          const n = index + 1;
          const state = n < step ? "done" : n === step ? "current" : "next";
          return (
            <li key={label} aria-current={state === "current" ? "step" : undefined} className={cn("flex items-center gap-2", state === "next" ? "text-muted-foreground" : "font-semibold")}>
              <span aria-hidden className={cn("grid size-6 place-items-center rounded-full text-xs tabular-nums", state === "current" ? "bg-primary text-primary-foreground" : state === "done" ? "bg-success-tint text-success-foreground" : "bg-muted")}>{n}</span>
              {label}{state === "done" && <span className="sr-only"> (fait)</span>}
            </li>
          );
        })}
      </ol>
    </header>
  );
}

export type PickCourse = { id: string; title: string; chapter: number | null; subject: string | null; mine?: number };

/**
 * Un cours à choisir pour en faire des fiches : pas la carte de cours habituelle (pas de couverture ni d'étoile),
 * mais une ligne avec l'action « Créer des fiches », et le nombre de fiches déjà faites.
 */
export function CoursePickList({ courses }: { courses: PickCourse[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {courses.map((course) => (
        <li key={course.id} className="min-w-0">
          <Link
            href={`/reviser/fiches/nouveau?cours=${course.id}`}
            className="group flex h-full min-h-20 items-center gap-3 rounded-xl border border-dashed border-input bg-card p-4 transition-[border-color,box-shadow] duration-(--dur-fast) hover-ok:border-primary hover-ok:shadow-xs focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="line-clamp-2 font-semibold">{course.title || "Sans titre"}</span>
              <span className="truncate text-sm text-muted-foreground">
                {[course.subject, course.chapter ? `chap. ${toRoman(course.chapter) || course.chapter}` : "", course.mine ? `${course.mine} ${course.mine > 1 ? "fiches" : "fiche"} déjà` : ""].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg bg-brand-tint px-2.5 text-sm font-semibold text-brand-text coarse:min-h-11">
              <Icon icon={IconAdd} size={16} /><span className="hidden sm:inline">Créer des fiches</span><span className="sr-only sm:hidden">Créer des fiches</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
