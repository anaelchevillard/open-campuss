"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState, useTransition } from "react";
import { cn } from "cn";
import { finishOnboarding } from "@/app/actions/onboarding";
import { FriendQuickAdd } from "@/components/friends/friend-quick-add";
import { Icon } from "@/components/icon";
import { IndependenceNotice } from "@/components/independence";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { IconCalendar, IconReading, IconShare, type IconData } from "@/lib/icons";
import { EASE_OUT } from "@/lib/motion";

type Intent = "read" | "exam" | "share";

const TILES: { id: Intent; label: string; icon: IconData }[] = [
  { id: "read", label: "Lire les cours", icon: IconReading },
  { id: "exam", label: "Préparer un partiel", icon: IconCalendar },
  { id: "share", label: "Partager mes notes", icon: IconShare },
];

/** Deux écrans, un choix par écran : ce qui t'amène, puis tes amis. Le reste s'apprend en s'en servant. */
export function Onboarding({ name, friendCode, initialIntent }: { name: string; friendCode: string; initialIntent?: Intent }) {
  const [step, setStep] = useState(0);
  const [intent, setIntent] = useState<Intent | undefined>(initialIntent);
  const [pending, start] = useTransition();
  const finish = () => start(() => finishOnboarding(intent));
  const first = name.split(" ")[0];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-1 flex-col px-4 pt-safe pb-safe">
      <div className="flex h-16 items-center justify-between">
        <Logo className="h-5 w-auto" />
        <ol aria-label={`Étape ${step + 1} sur 2`} className="flex gap-1.5">
          {[0, 1].map((i) => (
            <li key={i} aria-current={i === step ? "step" : undefined}
              className={cn("h-1.5 rounded-full transition-[width,background-color] duration-(--dur-base) ease-out", i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/40")} />
          ))}
        </ol>
      </div>
      <div className="flex flex-1 flex-col justify-center py-8">
        <AnimatePresence mode="wait" initial={false}>
          <motion.section key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2, ease: EASE_OUT }} className="grid gap-6">
            {step === 0 ? (
              <>
                <div className="grid gap-1">
                  <p className="text-muted-foreground">Bienvenue, {first}</p>
                  <h1 className="title text-balance">Qu’est-ce qui t’amène ?</h1>
                </div>
                <div role="radiogroup" aria-label="Ce qui t’amène" className="grid gap-3">
                  {TILES.map((tile) => {
                    const active = intent === tile.id;
                    return (
                      <button key={tile.id} type="button" role="radio" aria-checked={active}
                        onClick={() => { setIntent(tile.id); setStep(1); }}
                        className={cn("group flex min-h-[4.5rem] items-center gap-4 rounded-2xl bg-card px-4 text-left shadow-xs transition-[box-shadow,translate,scale] duration-(--dur-base) ease-out hover-ok:shadow-sm motion-ok:hover-ok:-translate-y-0.5 motion-ok:active:scale-[.985]",
                          active && "ring-2 ring-brand-text")}>
                        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", active ? "bg-brand-tint text-brand-text" : "bg-muted text-foreground")}>
                          <Icon icon={tile.icon} size={24} />
                        </span>
                        <span className="text-lg font-semibold">{tile.label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <h1 className="title text-balance">Révise avec tes amis</h1>
                <FriendQuickAdd code={friendCode} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button variant="ghost" onClick={() => setStep(0)}>Retour</Button>
                  <span className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={finish} disabled={pending}>Plus tard</Button>
                    <Button onClick={finish} pending={pending}>C’est parti</Button>
                  </span>
                </div>
              </>
            )}
          </motion.section>
        </AnimatePresence>
      </div>
      <IndependenceNotice className="pb-4 text-sm text-muted-foreground" />
    </main>
  );
}
