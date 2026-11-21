"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState, useTransition } from "react";
import { cn } from "cn";
import { toggleRequestVote } from "@/app/actions/requests";
import { Icon } from "@/components/icon";
import { IconThanks } from "@/lib/icons";
import { toastError } from "@/lib/toast";

/** Le chiffre roule, le pouce rebondit ; la liste ne se retrie pas sous le doigt (au prochain chargement seulement). */
export function RollingNumber({ value }: { value: number }) {
  const [previous, setPrevious] = useState(value);
  const [direction, setDirection] = useState(1);
  if (previous !== value) { setDirection(value > previous ? 1 : -1); setPrevious(value); }
  return (
    <span className="relative inline-flex overflow-hidden tabular-nums">
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <motion.span key={value} custom={direction}
          initial={{ y: `${direction * 100}%`, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: `${direction * -100}%`, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>{value}</motion.span>
      </AnimatePresence>
    </span>
  );
}

export function voteLabel(votes: number) {
  return `Moi aussi, ${votes} ${votes > 1 ? "étudiants attendent" : "étudiant attend"} ce cours`;
}

/** Bouton de vote : pouce et chiffre en colonne, cible de 44 px. `onVote` remplace l'action (besoin détecté). */
export function VoteButton({ voted, votes, onClick, className }: { voted: boolean; votes: number; onClick: () => void; className?: string }) {
  const [bump, setBump] = useState(0);
  return (
    <button type="button" aria-pressed={voted} aria-label={voteLabel(votes)} title={voteLabel(votes)}
      onClick={() => { if (!voted) setBump((b) => b + 1); onClick(); }}
      className={cn("flex min-h-11 min-w-12 shrink-0 flex-col items-center justify-center gap-0.5 self-start rounded-lg px-2 py-1.5 text-sm font-semibold transition-colors duration-(--dur-instant)",
        voted ? "bg-brand-tint text-brand-text" : "bg-muted text-muted-foreground hover-ok:text-foreground", className)}>
      <Icon key={bump} icon={IconThanks} size={20} filled={voted} className={bump ? "pop" : undefined} />
      <RollingNumber value={votes} />
    </button>
  );
}

export function RequestVote({ id, voted: initialVoted, votes: initialVotes }: { id: string; voted: boolean; votes: number }) {
  const [state, setState] = useState({ voted: initialVoted, votes: initialVotes });
  const [, start] = useTransition();
  const toggle = () => {
    const next = !state.voted;
    setState({ voted: next, votes: Math.max(0, state.votes + (next ? 1 : -1)) });
    start(async () => {
      try {
        const { voted } = await toggleRequestVote(id);
        if (voted !== next) setState((old) => ({ voted, votes: Math.max(0, old.votes + (voted ? 1 : -1)) }));
      } catch {
        setState((old) => ({ voted: !next, votes: Math.max(0, old.votes + (next ? -1 : 1)) }));
        toastError("Le vote n’a pas été enregistré");
      }
    });
  };
  return <VoteButton voted={state.voted} votes={state.votes} onClick={toggle} />;
}
