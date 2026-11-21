"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleRequestVote } from "@/app/actions/requests";
import { Icon } from "@/components/icon";
import { RequestComposer, type ComposerSubject } from "@/components/requests/request-composer";
import { Button } from "@/components/ui/button";
import { IconDone, IconThanks } from "@/lib/icons";

export type Similar = { id: string; text: string; votes: number; voted: boolean; subjectName: string };

/** Une demande proche existe : une voix de plus plutôt qu'un doublon. */
export function MeToo({ similar }: { similar: Similar }) {
  const [voted, setVoted] = useState(similar.voted);
  const [, start] = useTransition();
  const others = similar.votes - (similar.voted ? 1 : 0);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-brand-tint p-3 text-brand-text">
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold tabular-nums">{others > 1 ? `${others} étudiants attendent` : others === 1 ? "1 étudiant attend" : "Quelqu’un attend"}</span> déjà « {similar.text} »
      </p>
      <Button size="sm" variant={voted ? "ghost" : "outline"} aria-pressed={voted} className="bg-card"
        onClick={() => { const next = !voted; setVoted(next); start(async () => { const r = await toggleRequestVote(similar.id); setVoted(r.voted); }); }}>
        <Icon icon={voted ? IconDone : IconThanks} size={16} />{voted ? "Ta voix compte" : "Moi aussi"}
      </Button>
    </div>
  );
}

/** Le mini-formulaire de la palette : texte prérempli et modifiable, matière devinée. */
export function AskForm({ query, subjects, guessed, onDone }: { query: string; subjects: ComposerSubject[]; guessed: number | null; onDone: () => void }) {
  const [sent, setSent] = useState(false);
  if (sent) return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-success-tint p-3 text-success-foreground motion-ok:animate-rise">
      <Icon icon={IconDone} />
      <p className="flex-1 font-semibold">Demande envoyée</p>
      <Link href="/demandes?vue=miennes" onClick={onDone} className="text-sm font-semibold underline-offset-2 hover:underline">Voir les demandes</Link>
    </div>
  );
  return <RequestComposer subjects={subjects} initialSubject={guessed} initialText={query} autoFocus onSent={() => setSent(true)} />;
}
