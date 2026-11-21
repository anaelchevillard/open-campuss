"use client";

import type { RefObject } from "react";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { IconClose } from "@/lib/icons";
import { REVIEW_REASONS } from "@/lib/review-reasons";

/** Le panneau « Renvoyer ▾ » : motifs 1 à 7 en puces, un mot facultatif, Entrée pour confirmer. Même panneau dans la file et sur la page. */
export function ReasonPanel({ reason, onReason, word, onWord, onSubmit, onClose, submitLabel, shortcuts, wordRef }: {
  reason: number | null; onReason: (reason: number) => void; word: string; onWord: (word: string) => void;
  onSubmit: () => void; onClose: () => void; submitLabel: string; shortcuts: boolean; wordRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <form className="grid gap-3 px-2 pt-2 motion-ok:animate-rise" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Motif</p>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Fermer" onClick={onClose}><Icon icon={IconClose} size={16} /></Button>
      </div>
      <div role="radiogroup" aria-label="Motif" className="flex flex-wrap gap-1.5">
        {REVIEW_REASONS.map((text, i) => (
          <button key={text} type="button" role="radio" aria-checked={reason === i + 1} onClick={() => { onReason(i + 1); wordRef.current?.focus({ preventScroll: true }); }}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-input px-2.5 text-sm transition-colors coarse:min-h-11 hover:bg-muted aria-checked:border-transparent aria-checked:bg-brand-tint aria-checked:font-semibold aria-checked:text-brand-text">
            {shortcuts && <Kbd className="coarse:hidden">{i + 1}</Kbd>}{text}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input ref={wordRef} value={word} onChange={(e) => onWord(e.target.value)} maxLength={500} aria-label="Un mot pour l’auteur"
          placeholder={reason === 7 ? "Lien ou titre du doublon" : "Un mot pour l’auteur (facultatif)"} className="min-w-0 flex-1 basis-56 text-base" />
        <Button type="submit" variant="outline">{submitLabel}{shortcuts && <Kbd className="coarse:hidden">Entrée</Kbd>}</Button>
      </div>
    </form>
  );
}
