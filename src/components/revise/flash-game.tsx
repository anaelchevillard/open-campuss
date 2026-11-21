"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { finishFlash } from "@/app/actions/study";
import { Icon } from "@/components/icon";
import { Button, buttonVariants } from "@/components/ui/button";
import { celebrate } from "@/lib/celebrate";
import { IconTimer, IconXp } from "@/lib/icons";
import { EASE_OUT } from "@/lib/motion";
import { cue } from "./feedback";
import { RollingNumber, ThinProgress } from "./game-widgets";
import { SessionFrame } from "./session-frame";

export type FlashPair = { id: string; term: string; definition: string };

const SECONDS = 60;
const VISIBLE = 4;
const BEST_KEY = "campuss-eclair";

/** Éclair : 60 secondes pour associer termes et définitions de ses propres fiches. */
export function FlashGame({ pairs, account, prefs, showXp, exitHref = "/reviser" }: { pairs: FlashPair[]; account: string; prefs: { sounds?: boolean; haptics?: boolean }; showXp: boolean; exitHref?: string }) {
  const [started, setStarted] = useState(false);
  const [left, setLeft] = useState(SECONDS);
  const [cursor, setCursor] = useState(VISIBLE);
  const [board, setBoard] = useState(() => pairs.slice(0, VISIBLE));
  const [term, setTerm] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string | null>(null);
  const [found, setFound] = useState(0);
  const [done, setDone] = useState<{ xp: number; best: number; record: boolean } | null>(null);
  const reduce = useReducedMotion();
  const ended = useRef(false);

  // Définitions dans un autre ordre que les termes, sans hasard : décalées d'un cran
  const definitions = board.length > 1 ? [...board.slice(1), board[0]] : board;

  const end = useCallback(async (count: number) => {
    if (ended.current) return;
    ended.current = true;
    let best = 0;
    try { best = Number(localStorage.getItem(`${BEST_KEY}:${account}`)) || 0; } catch { /* stockage indisponible */ }
    const record = count > best;
    if (record) try { localStorage.setItem(`${BEST_KEY}:${account}`, String(count)); } catch { /* idem */ }
    const result = await finishFlash(count, SECONDS).catch(() => null);
    cue("done", prefs);
    if (record && count >= 5) void celebrate("quiz", account);
    setDone({ xp: result?.xp ?? 0, best: Math.max(best, count), record: record && best > 0 });
  }, [account, prefs]);

  useEffect(() => {
    if (!started || done) return;
    const timer = setInterval(() => setLeft((s) => { if (s <= 1) { clearInterval(timer); return 0; } return s - 1; }), 1000);
    return () => clearInterval(timer);
  }, [started, done]);
  useEffect(() => { if (started && (left === 0 || !board.length)) void end(found); }, [left, board.length, started, end, found]);

  const tapDefinition = (id: string) => {
    if (!term) return;
    if (id === term) {
      cue("good", prefs);
      setFound((n) => n + 1);
      setTerm(null);
      setBoard((all) => {
        const rest = all.filter((p) => p.id !== id);
        const next = pairs[cursor];
        return next ? [...rest, next] : rest;
      });
      setCursor((c) => c + 1);
    } else {
      cue("bad", prefs);
      setWrong(id);
      setTimeout(() => setWrong(null), 330);
    }
  };

  if (!started) {
    return (
      <SessionFrame exitHref={exitHref} title="Éclair">
        <section className="flex flex-1 flex-col items-center justify-center gap-6 py-10 text-center">
          <span className="grid size-16 place-items-center rounded-2xl bg-brand-tint text-brand-text"><Icon icon={IconXp} size={32} /></span>
          <div className="grid gap-2">
            <h2 className="title">Éclair</h2>
            <p className="text-muted-foreground">{SECONDS} secondes · associe chaque terme à sa définition</p>
          </div>
          <Button size="lg" className="w-full max-w-xs" onClick={() => setStarted(true)} autoFocus>Lancer</Button>
        </section>
      </SessionFrame>
    );
  }

  if (done) {
    return (
      <SessionFrame exitHref={exitHref} title="Éclair" progress={<ThinProgress value={100} label="Terminé" />}>
        <section className="flex flex-1 flex-col items-center justify-center gap-6 py-10 text-center" aria-live="polite">
          <p className="text-6xl font-semibold"><RollingNumber value={found} from={0} /></p>
          <h2 className="title">{found > 1 ? "paires trouvées" : "paire trouvée"}</h2>
          <p className="text-muted-foreground">{done.record ? "Nouveau record" : `Record : ${done.best}`}{showXp && done.xp > 0 ? ` · +${done.xp} XP` : ""}</p>
          <div className="flex w-full max-w-xs flex-col gap-2">
            <Link href={exitHref} data-slot="button" className={buttonVariants({ size: "lg" })}>Terminer</Link>
            <Button size="lg" variant="ghost" onClick={() => location.reload()}>Rejouer</Button>
          </div>
        </section>
      </SessionFrame>
    );
  }

  return (
    <SessionFrame exitHref={exitHref} title="Éclair" progress={<ThinProgress value={(left / SECONDS) * 100} label={`${left} secondes`} />}
      right={<span className="flex items-center gap-1 tabular-nums text-muted-foreground"><Icon icon={IconTimer} size={16} />{left}</span>}>
      <p className="py-3 text-center text-sm text-muted-foreground" aria-live="polite">{found} {found > 1 ? "paires" : "paire"}</p>
      <div className="grid flex-1 grid-cols-2 content-start gap-3 pb-6">
        <ul className="grid content-start gap-3" aria-label="Termes">
          <AnimatePresence initial={false}>
            {board.map((pair) => (
              <motion.li key={pair.id} layout={!reduce} initial={{ opacity: 0, scale: reduce ? 1 : 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: reduce ? 1 : 0.9 }} transition={{ duration: 0.18, ease: EASE_OUT }}>
                <button type="button" aria-pressed={term === pair.id} onClick={() => setTerm(pair.id)} className={cn("min-h-20 w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors coarse:min-h-24", term === pair.id ? "border-brand-text bg-brand-tint text-brand-text" : "border-input bg-card hover-ok:bg-muted")}>
                  <span data-reading className="line-clamp-3">{pair.term}</span>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        <ul className="grid content-start gap-3" aria-label="Définitions">
          <AnimatePresence initial={false}>
            {definitions.map((pair) => (
              <motion.li key={pair.id} layout={!reduce} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <button type="button" onClick={() => tapDefinition(pair.id)} className={cn("min-h-20 w-full rounded-xl border border-input bg-card px-3 py-2 text-left text-sm transition-colors hover-ok:bg-muted coarse:min-h-24", wrong === pair.id && "shake border-destructive bg-destructive-tint")}>
                  <span data-reading className="line-clamp-3">{pair.definition}</span>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </SessionFrame>
  );
}
