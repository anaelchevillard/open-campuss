"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { MEMO_GENERATE, MEMO_WRITE } from "@/components/reading/events";
import { reportMemoCard } from "@/app/actions/quality";
import { createCard } from "@/app/actions/study";
import { addMemoCards, generateMemoCards } from "@/app/actions/memo";
import { ActionForm, Notice } from "@/components/action-form";
import { TextField } from "@/components/field";
import { Submit } from "@/components/submit";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { IconAiCards, IconFlag } from "@/lib/icons";
import { AiButton } from "@/components/ai/ai-button";
import { AiSurface } from "@/components/ai/ai-surface";
import { AiWorking } from "@/components/ai/ai-working";

type Card = { front: string; back: string };

export function CampussAiButton({ busy, onClick, children, disabled }: { busy?: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return <AiButton type="button" icon={IconAiCards} busy={busy} disabled={busy || disabled} onClick={onClick}>{children}</AiButton>;
}

/** À la main ou par Campuss IA : la génération n'a lieu qu'une fois par cours, puis tout le monde lit la sauvegarde. */
export function MemoPanel({ docId, initial, aiReady }: { docId: string; initial: Card[] | null; aiReady: boolean }) {
  const [mode, setMode] = useState<"none" | "manual">("none");
  const [cards, setCards] = useState<Card[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [reported, setReported] = useState<Set<string>>(new Set());
  const generate = async () => {
    setBusy(true);
    setError("");
    const result = await generateMemoCards(docId).catch(() => ({ error: "Campuss IA ne répond pas. Réessaie dans un instant." }));
    if ("error" in result) setError(result.error);
    else setCards(result.cards);
    setBusy(false);
  };
  // « Écrire une fiche » des menus du cours ouvre le formulaire, que le cours soit lu ou non
  useEffect(() => {
    const onWrite = () => setMode("manual");
    addEventListener(MEMO_WRITE, onWrite);
    return () => removeEventListener(MEMO_WRITE, onWrite);
  }, []);
  // « Générer des fiches » du menu Réviser lance la même génération
  const generateRef = useRef(generate);
  useEffect(() => { generateRef.current = generate; });
  useEffect(() => {
    if (!aiReady) return;
    const onGenerate = () => void generateRef.current();
    addEventListener(MEMO_GENERATE, onGenerate);
    return () => removeEventListener(MEMO_GENERATE, onGenerate);
  }, [aiReady]);
  const add = async (list: Card[]) => {
    await addMemoCards(docId, list);
    setAdded((all) => new Set([...all, ...list.map((c) => c.front)]));
  };
  const report = async (card: Card) => {
    setError("");
    const result = await reportMemoCard(docId, card.front).catch(() => ({ error: "Le signalement n’est pas parti. Réessaie dans un instant." }));
    if (result.error) setError(result.error);
    else setReported((all) => new Set([...all, card.front]));
  };
  return (
    <section aria-label="Fiches mémo" className="mt-12 print:hidden">
      <h2 className="heading">Fiches mémo</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" aria-expanded={mode === "manual"} onClick={() => setMode((m) => (m === "manual" ? "none" : "manual"))}>Écrire une fiche</Button>
        {/* Un paquet vidé par les modérateurs ne se régénère pas à la demande d'un lecteur */}
        {(initial ? initial.length > 0 : aiReady) && <CampussAiButton busy={busy} onClick={() => (initial && !cards ? setCards(initial) : void generate())}>{busy ? "Campuss IA écrit tes fiches…" : initial ? "Voir les fiches de Campuss IA" : "Générer des fiches"}</CampussAiButton>}
      </div>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <AnimatePresence initial={false}>
        {mode === "manual" && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
            <ActionForm action={createCard} className="mt-3 grid gap-2">
              <input type="hidden" name="document" value={docId} />
              <TextField label="Question" name="front" rows={2} required maxLength={1000} />
              <TextField label="Réponse" name="back" rows={3} required maxLength={2000} />
              <div><Submit size="sm">Ajouter à mes révisions</Submit></div>
            </ActionForm>
          </motion.div>
        )}
      </AnimatePresence>
      {busy && <AiWorking className="mt-4" label="Campuss IA écrit tes fiches…" />}
      {cards && (
        <AiSurface className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{cards.length} fiches proposées</p><Button size="sm" variant="outline" disabled={cards.every((c) => added.has(c.front))} onClick={() => void add(cards)}>Tout ajouter</Button></div>
          <ul className="grid gap-2">
            {cards.map((card, index) => (
              <motion.li key={card.front} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05, duration: 0.25 }} className="flex items-start justify-between gap-3 rounded-lg bg-card p-3 shadow-xs">
                <span className="min-w-0"><span className="block font-semibold wrap-break-word">{card.front}</span><span className="mt-0.5 block text-sm text-muted-foreground wrap-break-word">{card.back}</span>
                  {reported.has(card.front)
                    ? <span role="status" className="mt-1 block text-sm text-muted-foreground">Signalée, merci.</span>
                    : <button type="button" onClick={() => void report(card)} className="mt-1 -ml-1 inline-flex min-h-8 items-center gap-1 rounded px-1 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"><Icon icon={IconFlag} className="size-3.5" />Signaler une erreur</button>}
                </span>
                <Button size="sm" variant="ghost" disabled={added.has(card.front)} onClick={() => void add([card])}>{added.has(card.front) ? "Ajoutée" : "Ajouter"}</Button>
              </motion.li>
            ))}
          </ul>
        </AiSurface>
      )}
    </section>
  );
}
