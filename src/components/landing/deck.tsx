"use client";

import { useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { animate, motion, useMotionValue, useTransform, type PanInfo } from "motion/react";
import { cn } from "cn";
import { isCalm } from "./calm";

export type DeckCard = { subject: string; front: string; back: string };

const THROW = 110;
const noop = () => () => undefined;

/**
 * Un vrai paquet à manipuler, comme dans Réviser : on retourne la fiche (clic, Espace, Entrée), puis on la lance à
 * droite si on la savait, à gauche sinon (geste, flèches ou boutons). En mouvement réduit : boutons seulement.
 */
export function Deck({ cards }: { cards: DeckCard[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [score, setScore] = useState({ good: 0, again: 0 });
  const [said, setSaid] = useState("");
  const calm = useSyncExternalStore(noop, isCalm, () => true);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-14, 14]);
  const goodGlow = useTransform(x, [0, THROW], [0, 1]);
  const againGlow = useTransform(x, [-THROW, 0], [1, 0]);

  const done = index >= cards.length;
  const card = cards[index];

  const rate = async (good: boolean) => {
    if (!flipped || done) return;
    if (!calm) await animate(x, good ? 520 : -520, { duration: 0.32, ease: [0.4, 0, 1, 1] });
    setScore((s) => (good ? { ...s, good: s.good + 1 } : { ...s, again: s.again + 1 }));
    setSaid(good ? "Bien : elle reviendra plus tard, de plus en plus espacée." : "Raté : elle revient dans la séance, tant que ce n’est pas su.");
    setFlipped(false);
    x.set(0);
    setIndex((i) => i + 1);
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > THROW) void rate(true);
    else if (info.offset.x < -THROW) void rate(false);
    else animate(x, 0, { type: "spring", stiffness: 500, damping: 30 });
  };
  const onKey = (e: KeyboardEvent) => {
    if (done) return;
    if ((e.key === " " || e.key === "Enter") && !flipped) { e.preventDefault(); setFlipped(true); setSaid(`Réponse : ${card.back}`); }
    else if (e.key === "ArrowRight" && flipped) { e.preventDefault(); void rate(true); }
    else if (e.key === "ArrowLeft" && flipped) { e.preventDefault(); void rate(false); }
  };
  const restart = () => { setIndex(0); setScore({ good: 0, again: 0 }); setFlipped(false); setSaid("Paquet mélangé, c’est reparti."); };

  return (
    <div className="lp-deck" onKeyDown={onKey}>
      <div className="lp-deck-pile">
        {done ? (
          <div className="lp-deck-end">
            <p className="lp-h3">Paquet terminé</p>
            <p className="mt-2 text-muted-foreground">{score.good} sue{score.good > 1 ? "s" : ""} · {score.again} à revoir</p>
            <button type="button" onClick={restart} className="lp-chip mt-5">Recommencer</button>
          </div>
        ) : (
          cards.slice(index, index + 3).reverse().map((c, k, shown) => {
            const depth = shown.length - 1 - k;
            const top = depth === 0;
            return (
              <motion.div
                key={`${index + depth}-${c.front}`}
                className="lp-deck-card"
                style={top ? { x, rotate, zIndex: 3 } : { zIndex: 3 - depth, scale: 1 - depth * 0.05, y: depth * 14 }}
                drag={top && flipped && !calm ? "x" : false}
                dragSnapToOrigin={false}
                onDragEnd={top ? onDragEnd : undefined}
                aria-hidden={!top}
              >
                <button
                  type="button"
                  tabIndex={top ? 0 : -1}
                  onClick={() => { if (top && !flipped) { setFlipped(true); setSaid(`Réponse : ${c.back}`); } }}
                  aria-label={top ? (flipped ? `Réponse : ${c.back}` : `Question : ${c.front}. Retourner la fiche`) : undefined}
                  className={cn("lp-flip block size-full text-left", top && flipped && !calm && "cursor-grab active:cursor-grabbing")}
                  data-flipped={(top && flipped) || undefined}
                >
                  <span className="lp-flip-inner relative grid size-full [&>*]:col-start-1 [&>*]:row-start-1">
                    <span className="lp-flip-face lp-deck-face">
                      <span className="lp-kicker">{c.subject}</span>
                      <span className="lp-deck-q">{c.front}</span>
                      <span className="text-sm text-muted-foreground">Touche pour retourner</span>
                    </span>
                    <span className="lp-flip-face lp-flip-back lp-deck-face lp-deck-back">
                      <span className="lp-kicker">Réponse</span>
                      <span className="text-lg">{c.back}</span>
                      <span className="text-sm opacity-80">{calm ? "Tu la savais ?" : "Lance-la : à droite si tu la savais"}</span>
                    </span>
                  </span>
                </button>
                {top && (
                  <>
                    <motion.span aria-hidden="true" style={{ opacity: goodGlow }} className="lp-deck-stamp" data-kind="good">Bien</motion.span>
                    <motion.span aria-hidden="true" style={{ opacity: againGlow }} className="lp-deck-stamp" data-kind="again">Raté</motion.span>
                  </>
                )}
              </motion.div>
            );
          })
        )}
      </div>
      {!done && (
        <div className="mt-8 flex items-center justify-center gap-3">
          <button type="button" disabled={!flipped} onClick={() => void rate(false)} className="lp-chip" data-kind="again">← Raté</button>
          <span className="min-w-14 text-center text-sm text-muted-foreground tabular-nums">{index + 1} / {cards.length}</span>
          <button type="button" disabled={!flipped} onClick={() => void rate(true)} className="lp-chip" data-kind="good">Bien →</button>
        </div>
      )}
      <p role="status" aria-live="polite" className="mt-4 min-h-6 text-center text-sm text-muted-foreground">{said}</p>
    </div>
  );
}
