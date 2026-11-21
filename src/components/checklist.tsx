"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, useTransition } from "react";
import { setChecklistDismissed } from "@/app/actions/onboarding";
import { DrawnCheck } from "@/components/home/progress-ring";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { celebrate } from "@/lib/celebrate";
import { checklistProgress, type ChecklistStep } from "@/lib/checklist";
import { IconChevronRight, IconClose } from "@/lib/icons";
import { toastUndo } from "@/lib/toast";

/**
 * « Bien démarrer » : cinq étapes qui se cochent seules par l'usage. Fermable (« Annuler » pendant 6 s) ;
 * complète, elle célèbre une fois puis s'efface pour de bon.
 */
export function Checklist({ steps, account }: { steps: ChecklistStep[]; account: string }) {
  const [visible, setVisible] = useState(true);
  const [, start] = useTransition();
  const { done, total, complete } = checklistProgress(steps);

  useEffect(() => {
    if (!complete) return;
    void celebrate("badge", account);
    const timer = setTimeout(() => { setVisible(false); start(() => setChecklistDismissed(true)); }, 2400);
    return () => clearTimeout(timer);
  }, [complete, account]);

  const dismiss = () => {
    setVisible(false);
    start(() => setChecklistDismissed(true));
    toastUndo("« Bien démarrer » fermée", () => { setVisible(true); start(() => setChecklistDismissed(false)); });
  };

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.section aria-labelledby="bien-demarrer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
          className="rounded-2xl bg-card p-4 shadow-xs md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="grid gap-0.5">
              <h2 id="bien-demarrer" className="heading">{complete ? "Bien parti" : "Bien démarrer"}</h2>
              <p className="text-sm text-muted-foreground tabular-nums">{done} sur {total}</p>
            </div>
            {!complete && <Button variant="ghost" size="icon" onClick={dismiss} aria-label="Fermer « Bien démarrer »" className="-mt-1 -mr-2"><Icon icon={IconClose} /></Button>}
          </div>
          <Progress value={(done / total) * 100} aria-label={`${done} étapes sur ${total}`} className="mt-3 [&_[data-slot=progress-indicator]]:bg-success [&_[data-slot=progress-indicator]]:duration-(--dur-slow)" />
          <ul className="mt-3 grid">
            {steps.map((step) => (
              <li key={step.id}>
                <Link href={step.href} className="group -mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 transition-colors hover:bg-muted">
                  <DrawnCheck done={step.done} />
                  <span className={step.done ? "flex-1 text-muted-foreground line-through decoration-muted-foreground/50" : "flex-1 font-semibold"}>{step.label}</span>
                  {!step.done && <Icon icon={IconChevronRight} size={16} className="text-muted-foreground transition-transform motion-ok:group-hover:translate-x-0.5" />}
                </Link>
              </li>
            ))}
          </ul>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
