"use client";

import Link from "next/link";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useReducedMotionConfig, useTransform, type PanInfo } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "cn";
import { answerQuestion, finishSession, gradeCard, gradeNewCard, setCardSuspended, undoGrade, type StudyResult } from "@/app/actions/study";
import { AiBadge } from "@/components/ai/ai-badge";
import { Icon } from "@/components/icon";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { useCoarsePointer } from "@/hooks/use-media";
import { celebrate } from "@/lib/celebrate";
import type { GameSnapshot } from "@/lib/habits";
import { goodSession } from "@/lib/memo-pack-rules";
import { IconArchive, IconDone, IconEdit, IconError, IconKeyboard, IconMore, IconSuccess, IconTimer, IconUndo, IconXp } from "@/lib/icons";
import { EASE_OUT, sheet, snappy } from "@/lib/motion";
import { remainingCounts, SESSION_KEYS, sessionKeyAction } from "@/lib/session-keys";
import type { SessionItem } from "@/lib/today-session";
import { toastError, toastUndo } from "@/lib/toast";
import { EditCardForm } from "./card-editor";
import { CardText } from "./card-text";
import { cue } from "./feedback";
import { GoalRing, RollingNumber, StreakFlame, ThinProgress } from "./game-widgets";
import { SessionFrame } from "./session-frame";

const GRADES = [
  { value: 0, label: "Raté", key: "1" },
  { value: 1, label: "Difficile", key: "2" },
  { value: 2, label: "Bien", key: "3" },
  { value: 3, label: "Facile", key: "4" },
] as const;

const PAUSE_AFTER_MS = 45 * 60_000;
const STREAK_MILESTONES = [7, 30, 100];

type Props = {
  items: SessionItem[];
  /** Absent quand les éléments de jeu sont masqués : ni XP, ni flamme, ni anneau. */
  game: GameSnapshot | null;
  account: string;
  prefs: { sounds?: boolean; haptics?: boolean };
  exitHref?: string;
  moreHref?: string;
  title?: string;
  /** Sens inversé : la réponse d'abord, la question au dos. Même état FSRS. */
  reversed?: boolean;
  /** Montré à la fin d'une bonne séance seulement (« Aide ta promo »). */
  afterGood?: ReactNode;
};

type Answer = { correct: boolean; answer: number; explanation: string; chosen: number };
type CardItem = Extract<SessionItem, { kind: "card" | "new" }>;
type Stats = { done: number; good: number; xp: number };
/** Ce qu'il faut pour revenir sur la dernière note : la file, la position, les chiffres et la note côté serveur. */
type Step = { queue: SessionItem[]; position: number; stats: Stats; combo: number; review: Promise<number | undefined> };

export function SessionPlayer({ items, game: initialGame, account, prefs, exitHref = "/reviser", moreHref, title = "Séance", reversed = false, afterGood }: Props) {
  const [queue, setQueue] = useState(items);
  const [position, setPosition] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [combo, setCombo] = useState(0);
  const [stats, setStats] = useState<Stats>({ done: 0, good: 0, xp: 0 });
  const [game, setGame] = useState(initialGame);
  const [finished, setFinished] = useState<StudyResult | null>(null);
  const [pauseOffered, setPauseOffered] = useState(false);
  const [history, setHistory] = useState<Step[]>([]);
  const [editing, setEditing] = useState(false);
  const [help, setHelp] = useState(false);
  const [announce, setAnnounce] = useState("");
  const startedAt = useRef(0);
  const shownAt = useRef(0);
  const retried = useRef(new Set<number>());
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const total = queue.length;
  const item = queue[position];
  const playGame = Boolean(initialGame);
  const left = remainingCounts(queue.slice(position));

  useEffect(() => { startedAt.current = Date.now(); shownAt.current = Date.now(); }, []);
  useEffect(() => { shownAt.current = Date.now(); }, [position]);
  useEffect(() => {
    const timer = setInterval(() => { if (Date.now() - startedAt.current > PAUSE_AFTER_MS) { setPauseOffered(true); clearInterval(timer); } }, 30_000);
    return () => clearInterval(timer);
  }, []);

  const absorb = useCallback((result: StudyResult | null) => {
    if (!result) return;
    setStats((s) => ({ ...s, xp: s.xp + result.xp }));
    setGame(result.game);
    if (result.goalReached && playGame) void celebrate("goal", account);
  }, [account, playGame]);

  // Les envois partent dans l'ordre, sans bloquer la fiche suivante ; la promesse rend l'identifiant de la note
  const send = useCallback((task: () => Promise<StudyResult | null>) => {
    const run = chain.current.then(task);
    chain.current = run.then(absorb).catch(() => toastError("Connexion perdue, la note n’a pas été enregistrée"));
    return run.then((result) => result?.reviewId).catch(() => undefined);
  }, [absorb]);

  const next = useCallback(() => {
    setFlipped(false);
    setAnswer(null);
    setPosition((p) => p + 1);
  }, []);

  const flip = useCallback(() => {
    const now = !flipped;
    setFlipped(now);
    if (item && item.kind !== "question") setAnnounce(now ? `${reversed ? "Question" : "Réponse"} : ${reversed ? item.front : item.back}` : "");
  }, [flipped, item, reversed]);

  useEffect(() => {
    if (position < total || finished || !total) return;
    const seconds = Math.round((Date.now() - startedAt.current) / 1000);
    const before = initialGame?.streak ?? 0;
    chain.current = chain.current.then(() => finishSession(seconds)).then((result) => {
      setFinished(result);
      setStats((s) => ({ ...s, xp: s.xp + result.xp }));
      setGame(result.game);
      cue("done", prefs);
      if (!playGame) return;
      if (result.goalReached) void celebrate("goal", account);
      else if (STREAK_MILESTONES.some((m) => before < m && result.game.streak >= m)) void celebrate("streak", account);
    }).catch(() => setFinished({ xp: 0, goalReached: false, quests: [], game: initialGame ?? ({} as GameSnapshot) }));
  }, [position, total, finished, initialGame, prefs, account, playGame]);

  const grade = useCallback((value: 0 | 1 | 2 | 3) => {
    if (!item || item.kind === "question" || !flipped) return;
    const ms = Date.now() - shownAt.current;
    const ok = value >= 2;
    cue(ok ? "good" : "bad", prefs);
    const review = item.kind === "card" ? send(() => gradeCard(item.id, value, ms)) : send(() => gradeNewCard(item.docId, item.index, value, ms));
    setHistory((all) => [...all.slice(-19), { queue, position, stats, combo, review }]);
    setCombo((c) => (ok ? c + 1 : 0));
    setStats((s) => ({ ...s, done: s.done + 1, good: s.good + (ok ? 1 : 0) }));
    setAnnounce(`${GRADES[value].label}. ${item.previews?.[value] ? `Revoir dans ${item.previews[value]}.` : ""}`);
    // Une fiche ratée revient une fois en fin de séance
    if (value === 0 && !retried.current.has(position)) {
      retried.current.add(queue.length);
      setQueue((all) => [...all, item.kind === "new" ? { ...item } : item]);
    }
    next();
  }, [combo, flipped, item, next, position, prefs, queue, send, stats]);

  /** Revient sur la dernière note : la fiche réapparaît retournée, son état FSRS est remis sur le serveur. */
  const undo = useCallback(() => {
    const last = history.at(-1);
    if (!last || finished) return;
    setHistory((all) => all.slice(0, -1));
    setQueue(last.queue);
    setPosition(last.position);
    setStats(last.stats);
    setCombo(last.combo);
    setAnswer(null);
    setFlipped(true);
    retried.current.delete(last.queue.length);
    setAnnounce("Dernière note annulée");
    chain.current = chain.current.then(async () => {
      const id = await last.review;
      if (!id) return;
      const result = await undoGrade(id);
      if ("error" in result) toastError(result.error);
    }).catch(() => toastError("Connexion perdue, la note n’a pas été annulée"));
  }, [finished, history]);

  /** Met la fiche de côté sans la noter : elle ne revient plus jusqu'à ce qu'on la reprenne (page Fiches). */
  const suspend = useCallback(() => {
    if (!item || item.kind !== "card") return;
    const id = item.id;
    void setCardSuspended(id, true).then((result) => {
      if ("error" in result) { toastError(result.error); return; }
      toastUndo("Fiche mise de côté", () => { void setCardSuspended(id, false); });
    }).catch(() => toastError("Connexion perdue, réessaie"));
    setQueue((all) => all.filter((entry, index) => index <= position || entry.kind !== "card" || entry.id !== id));
    next();
  }, [item, next, position]);

  const choose = useCallback(async (choice: number) => {
    if (!item || item.kind !== "question" || answer || busy) return;
    setBusy(true);
    try {
      const result = await answerQuestion(item.docId, item.index, choice);
      setAnswer({ correct: result.correct, answer: result.answer, explanation: result.explanation, chosen: choice });
      cue(result.correct ? "good" : "bad", prefs);
      setCombo((c) => (result.correct ? c + 1 : 0));
      setStats((s) => ({ ...s, done: s.done + 1, good: s.good + (result.correct ? 1 : 0) }));
      absorb(result);
    } catch {
      toastError("Connexion perdue, réessaie");
    } finally {
      setBusy(false);
    }
  }, [absorb, answer, busy, item, prefs]);

  // Clavier (comme Anki) : Espace ou Entrée retourne puis note Bien, 1 à 4 notent, Z annule, E modifie, M met de côté, ? aide
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || document.documentElement.classList.contains("no-shortcuts")) return;
      if ((event.target as HTMLElement)?.closest("input, textarea, select, [contenteditable], [role=dialog], [role=menu]")) return;
      if (!item || editing) return;
      if (item.kind === "question") {
        if (event.metaKey || event.ctrlKey) return;
        const n = Number(event.key);
        if (n >= 1 && n <= item.choices.length && !answer) { event.preventDefault(); void choose(n - 1); }
        else if ((event.key === "Enter" || event.key === " ") && answer) { event.preventDefault(); next(); }
        return;
      }
      // Espace ou Entrée sur un bouton ou un lien focalisé : il garde son rôle
      if ((event.key === " " || event.key === "Enter") && (event.target as HTMLElement)?.closest("button, a")) return;
      const action = sessionKeyAction(event, flipped);
      if (!action) return;
      event.preventDefault();
      if (action.type === "flip") flip();
      else if (action.type === "grade") grade(action.grade);
      else if (action.type === "undo") undo();
      else if (action.type === "edit" && item.kind === "card") setEditing(true);
      else if (action.type === "suspend") suspend();
      else if (action.type === "help") setHelp(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, choose, editing, flip, flipped, grade, item, next, suspend, undo]);

  const progress = total ? (Math.min(position, total) / total) * 100 : 100;
  const right = (
    <>
      {combo >= 3 && !finished && <motion.span key={combo} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={snappy} className="rounded-full bg-brand-tint px-2 py-0.5 text-xs font-semibold tabular-nums text-brand-text" aria-label={`${combo} réussites de suite`}>×{combo}</motion.span>}
      {playGame && !finished && <span className="flex items-center gap-1 tabular-nums text-muted-foreground" aria-label={`${stats.xp} XP gagnés`}><Icon icon={IconXp} size={16} />{stats.xp}</span>}
      {!finished && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Plus d’actions" className="coarse:size-11"><Icon icon={IconMore} size={20} /></Button>} />
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuItem disabled={!history.length} onClick={undo}><Icon icon={IconUndo} size={16} />Annuler la dernière note<Kbd className="ml-auto hidden fine:inline-flex">Z</Kbd></DropdownMenuItem>
            <DropdownMenuItem disabled={item?.kind !== "card"} onClick={() => setEditing(true)}><Icon icon={IconEdit} size={16} />Modifier la fiche<Kbd className="ml-auto hidden fine:inline-flex">E</Kbd></DropdownMenuItem>
            <DropdownMenuItem disabled={item?.kind !== "card"} onClick={suspend}><Icon icon={IconArchive} size={16} />Mettre de côté<Kbd className="ml-auto hidden fine:inline-flex">M</Kbd></DropdownMenuItem>
            <DropdownMenuItem onClick={() => setHelp(true)}><Icon icon={IconKeyboard} size={16} />Raccourcis clavier<Kbd className="ml-auto hidden fine:inline-flex">?</Kbd></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );

  if (finished || (total > 0 && position >= total)) {
    return (
      <SessionFrame exitHref={exitHref} title={title} progress={<ThinProgress value={100} label="Séance terminée" />}>
        <Recap stats={stats} result={finished} before={initialGame} game={game} exitHref={exitHref} moreHref={moreHref} after={goodSession(stats.done, stats.good) ? afterGood : undefined} />
      </SessionFrame>
    );
  }

  const countsLine = [left.due ? `${left.due} à revoir` : "", left.fresh ? `${left.fresh} ${left.fresh > 1 ? "nouvelles" : "nouvelle"}` : "", left.questions ? `${left.questions} ${left.questions > 1 ? "questions" : "question"}` : ""].filter(Boolean).join(" · ");

  return (
    <SessionFrame exitHref={exitHref} title={title} right={right} progress={<ThinProgress value={progress} label={`${Math.min(position + 1, total)} sur ${total}`} />}>
      <p className="sr-only" aria-live="polite" aria-atomic>{announce}</p>
      <p className="mt-3 text-center text-xs text-muted-foreground tabular-nums">{countsLine}{reversed && <span> · sens inversé</span>}</p>
      {pauseOffered && (
        <div role="status" className="rise mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-info-tint px-4 py-3 text-sm text-info-foreground">
          <Icon icon={IconTimer} size={20} />
          <span className="min-w-0 flex-1">45 minutes de révision : une pause aide à retenir</span>
          <Button size="sm" variant="ghost" onClick={() => setPauseOffered(false)}>Continuer</Button>
          <Link href={exitHref} data-slot="button" className={buttonVariants({ variant: "outline", size: "sm" })}>Faire une pause</Link>
        </div>
      )}
      <div className="flex flex-1 flex-col justify-center py-6">
        <AnimatePresence mode="popLayout" initial={false}>
          {item?.kind === "question"
            ? <Question key={`q-${position}`} item={item} answer={answer} busy={busy} onChoose={(c) => void choose(c)} />
            : item && <FlashCard key={`c-${position}`} item={item} flipped={flipped} reversed={reversed} onFlip={flip} onSwipe={grade} />}
        </AnimatePresence>
      </div>
      <div className="sticky bottom-0 -mx-4 bg-background/95 px-4 pt-2 pb-4 backdrop-blur md:-mx-6 md:px-6">
        {item?.kind === "question" ? (
          answer
            ? <Button size="lg" className="w-full" onClick={next} autoFocus>Continuer</Button>
            : <p className="py-2 text-center text-sm text-muted-foreground">Choisis une réponse</p>
        ) : (
          <div className="grid gap-2">
            {/* Les notes n'apparaissent qu'une fois la réponse vue, avec l'intervalle qui suivra chacune */}
            {!flipped ? <Button variant="outline" size="lg" className="w-full" onClick={flip}>Voir la réponse<Kbd className="ml-1 hidden fine:inline-flex">Espace</Kbd></Button> : (
              <div className="grid grid-cols-4 gap-2" role="group" aria-label="Noter la fiche">
                {GRADES.map((g) => {
                  const after = item?.previews?.[g.value];
                  return (
                    <Button key={g.value} variant={g.value === 0 ? "destructive" : g.value === 2 ? "default" : "outline"} size="lg" className="h-auto min-h-14 flex-col gap-0 px-1 py-1.5" onClick={() => grade(g.value)} aria-label={after ? `${g.label}, revoir dans ${after}` : g.label} aria-keyshortcuts={g.key}>
                      <span>{g.label}</span>
                      {after && <span className="text-xs font-normal tabular-nums opacity-80">{after}</span>}
                      {/* Couleur du bouton, pas le gris atténué : lisible (AA) sur chaque variante, bordeaux plein compris */}
                      <Kbd className="mt-0.5 hidden h-4 bg-transparent text-current fine:inline-flex">{g.key}</Kbd>
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <ResponsiveSheet open={editing && item?.kind === "card"} onOpenChange={setEditing} title="Modifier la fiche">
        {item?.kind === "card" && (
          <EditCardForm key={item.id} card={item} onSaved={(text) => {
            setQueue((all) => all.map((entry) => (entry.kind === "card" && entry.id === item.id ? { ...entry, ...text } : entry)));
            setEditing(false);
          }} />
        )}
      </ResponsiveSheet>
      <ResponsiveSheet open={help} onOpenChange={setHelp} title="Raccourcis clavier" size="sm">
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 pb-4 text-sm">
          {SESSION_KEYS.map((entry) => (
            <div key={entry.label} className="contents">
              <dt className="flex gap-1">{entry.keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</dt>
              <dd>{entry.label}</dd>
            </div>
          ))}
        </dl>
      </ResponsiveSheet>
    </SessionFrame>
  );
}

/**
 * Fiche : un toucher ou Espace la retourne. Une fois la réponse vue, au téléphone, glisser à droite = Bien,
 * à gauche = Raté (les boutons restent). Le contenu est rendu en Markdown et formules (CardText).
 */
function FlashCard({ item, flipped, reversed, onFlip, onSwipe }: { item: CardItem; flipped: boolean; reversed: boolean; onFlip: () => void; onSwipe: (grade: 0 | 2) => void }) {
  const coarse = useCoarsePointer();
  // Réglage du système OU réglage Campuss (MotionConfig « always ») : pas de rotation 3D du tout.
  // Lu après le montage : le rendu serveur ne connaît pas la préférence, et React ne corrige pas les attributs
  // `style` divergents à l'hydratation (la face arrière restait retournée, donc invisible : carte vide).
  const prefersReduce = Boolean(useReducedMotionConfig());
  const [reduce, setReduce] = useState(false);
  useEffect(() => { setReduce(prefersReduce); }, [prefersReduce]); // eslint-disable-line react-hooks/set-state-in-effect -- préférence connue seulement côté navigateur
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-8, 8]);
  const good = useTransform(x, [0, 160], [0, 1]);
  const bad = useTransform(x, [-160, 0], [1, 0]);
  const width = useRef(360);
  const end = (_: unknown, info: PanInfo) => {
    const threshold = width.current * 0.35;
    if (info.offset.x > threshold || info.velocity.x > 500) onSwipe(2);
    else if (info.offset.x < -threshold || info.velocity.x < -500) onSwipe(0);
  };
  const front = reversed ? item.back : item.front;
  const back = reversed ? item.front : item.back;
  const swipe = coarse && !reduce && flipped;
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: reduce ? 0 : x.get() > 0 ? 80 : x.get() < 0 ? -80 : 0, transition: { duration: 0.15 } }}
      transition={{ duration: 0.25, ease: EASE_OUT }}
      className="mx-auto w-full max-w-xl"
      ref={(node) => { if (node) width.current = node.offsetWidth; }}
    >
      <motion.div
        drag={swipe ? "x" : false} dragSnapToOrigin dragElastic={0.6} onDragEnd={end} transition={sheet}
        style={{ x, rotate, touchAction: "pan-y", perspective: 1200 }}
        className="relative"
      >
        <motion.span aria-hidden style={{ opacity: good }} className="pointer-events-none absolute inset-0 z-10 grid place-items-start justify-end rounded-2xl bg-success-tint/40 p-4 text-sm font-semibold text-success-foreground ring-2 ring-[var(--success)]">Bien</motion.span>
        <motion.span aria-hidden style={{ opacity: bad }} className="pointer-events-none absolute inset-0 z-10 grid place-items-start justify-start rounded-2xl bg-warning-tint/40 p-4 text-sm font-semibold text-warning-foreground ring-2 ring-[var(--warning)]">Raté</motion.span>
        {/* Surface cliquable à la souris et au toucher ; au clavier, Espace et le bouton « Voir la réponse » font la même chose */}
        <motion.div
          onClick={onFlip} data-flipped={flipped || undefined}
          animate={reduce ? { rotateY: 0, opacity: [0.6, 1] } : { rotateY: flipped ? 180 : 0 }}
          transition={reduce ? { duration: 0.12, rotateY: { duration: 0 } } : { duration: 0.4, ease: EASE_OUT }}
          style={reduce ? { transform: "none" } : { transformStyle: "preserve-3d" }}
          className="relative grid min-h-72 w-full cursor-pointer rounded-2xl bg-card text-left shadow-sm select-text md:min-h-80"
        >
          <Face hidden={flipped} back={false} flat={reduce}>
            <span className="flex items-center gap-2 text-sm text-muted-foreground">{item.kind === "new" ? <><span>Nouvelle</span><AiBadge /></> : reversed ? "Réponse · à quelle question ?" : "Question"}</span>
            {/* text-pretty et non text-balance : la question occupe toute la largeur utile de la carte (capture 23) */}
            <CardText text={front} className="text-lg font-semibold text-pretty" />
          </Face>
          <Face hidden={!flipped} back={!reduce} flat={reduce}>
            <span className="text-sm text-muted-foreground">{reversed ? "Question" : "Réponse"}</span>
            <CardText text={back} className="text-lg text-pretty" />
            {swipe && <span aria-hidden className="mt-auto text-xs text-muted-foreground">Glisse à droite : Bien · à gauche : Raté</span>}
          </Face>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

/** En mouvement réduit (`flat`), aucune transformation : la face visible est simplement affichée. La face cachée sort de l'arbre d'accessibilité. */
function Face({ children, back, hidden, flat }: { children: React.ReactNode; back: boolean; hidden: boolean; flat: boolean }) {
  return (
    <div
      aria-hidden={hidden || undefined}
      style={flat ? { backfaceVisibility: "visible", WebkitBackfaceVisibility: "visible", transform: "none" } : { backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: back ? "rotateY(180deg)" : undefined }}
      className={cn("col-start-1 row-start-1 flex flex-col justify-center gap-3 overflow-auto p-6 md:p-8", hidden && flat && "invisible")}
    >
      {children}
    </div>
  );
}

function Question({ item, answer, busy, onChoose }: { item: Extract<SessionItem, { kind: "question" }>; answer: Answer | null; busy: boolean; onChoose: (choice: number) => void }) {
  const reduce = useReducedMotion();
  return (
    <motion.fieldset initial={{ opacity: 0, y: reduce ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ duration: 0.25, ease: EASE_OUT }} className="mx-auto grid w-full max-w-xl gap-2" aria-busy={busy}>
      <legend className="mb-4 grid gap-2">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">Question de quiz<AiBadge /></span>
        <span data-reading className="text-lg font-semibold text-pretty">{item.question}</span>
      </legend>
      {item.choices.map((choice, index) => {
        const isAnswer = answer && index === answer.answer;
        const wrong = answer && index === answer.chosen && !answer.correct;
        return (
          <button
            key={index} type="button" disabled={Boolean(answer)} onClick={() => onChoose(index)}
            className={cn(
              "flex min-h-12 w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-colors duration-(--dur-fast) disabled:cursor-default coarse:min-h-14",
              !answer && "border-input hover-ok:bg-muted",
              answer && !isAnswer && !wrong && "border-border opacity-60",
              isAnswer && "border-[var(--success)] bg-success-tint",
              wrong && "shake border-destructive bg-destructive-tint",
            )}
          >
            <Kbd className="hidden fine:inline-flex">{index + 1}</Kbd>
            <span data-reading className="min-w-0 flex-1">{choice}</span>
            {isAnswer && <span className="flex items-center gap-1 text-sm font-semibold text-success-foreground"><Icon icon={IconSuccess} size={20} />{answer?.chosen === index ? "Juste" : "Bonne réponse"}</span>}
            {wrong && <span className="flex items-center gap-1 text-sm font-semibold text-destructive-foreground"><Icon icon={IconError} size={20} />Faux</span>}
          </button>
        );
      })}
      {answer?.explanation && <p className="rise mt-2 text-sm text-pretty text-muted-foreground">{answer.explanation}</p>}
      {answer && <p className="text-xs text-muted-foreground">Généré par Campuss IA · à vérifier</p>}
    </motion.fieldset>
  );
}

function Recap({ stats, result, before, game, exitHref, moreHref, after }: { stats: { done: number; good: number; xp: number }; result: StudyResult | null; before: GameSnapshot | null; game: GameSnapshot | null; exitHref: string; moreHref?: string; after?: ReactNode }) {
  const accuracy = stats.done ? Math.round((stats.good / stats.done) * 100) : 0;
  const reduce = useReducedMotion();
  return (
    <motion.section initial={{ opacity: 0, y: reduce ? 0 : 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }} className="flex flex-1 flex-col items-center justify-center gap-8 py-10 text-center" aria-live="polite">
      <div className="grid justify-items-center gap-3">
        <span className="pop grid size-14 place-items-center rounded-full bg-success-tint text-success-foreground"><Icon icon={IconDone} size={32} /></span>
        <h2 className="title">Séance terminée</h2>
      </div>
      <dl className="grid w-full max-w-md grid-cols-3 gap-3">
        {before && game && <div className="grid gap-1 rounded-xl bg-card p-4 shadow-xs"><dt className="order-2 text-sm text-muted-foreground">XP</dt><dd className="text-2xl font-semibold">+<RollingNumber value={stats.xp} from={0} /></dd></div>}
        <div className="grid gap-1 rounded-xl bg-card p-4 shadow-xs"><dt className="order-2 text-sm text-muted-foreground">précision</dt><dd className="text-2xl font-semibold"><RollingNumber value={accuracy} from={0} /> %</dd></div>
        <div className="grid gap-1 rounded-xl bg-card p-4 shadow-xs"><dt className="order-2 text-sm text-muted-foreground">{stats.done > 1 ? "révisées" : "révisée"}</dt><dd className="text-2xl font-semibold tabular-nums">{stats.done}</dd></div>
      </dl>
      {before && game && result && (
        <div className="flex flex-wrap items-center justify-center gap-6">
          <GoalRing value={game.today} goal={game.goal} size={72} stroke={7}><span className="text-sm font-semibold tabular-nums">{Math.min(game.today, game.goal)}/{game.goal}</span></GoalRing>
          <div className="grid justify-items-start gap-0.5 text-left">
            <StreakFlame streak={game.streak} from={before.streak} size={32} className="text-2xl" />
            <span className="text-sm text-muted-foreground">{game.streak > 1 ? "jours de série" : "jour de série"}</span>
          </div>
        </div>
      )}
      {!result && <p className="text-sm text-muted-foreground" aria-busy>Enregistrement…</p>}
      {after && <div className="w-full max-w-md">{after}</div>}
      <div className="flex w-full max-w-md flex-col gap-2">
        <Link href={exitHref} data-slot="button" className={buttonVariants({ size: "lg" })}>Terminer</Link>
        {moreHref && <Link href={moreHref} data-slot="button" className={buttonVariants({ variant: "ghost", size: "lg" })}>Encore 5 fiches</Link>}
      </div>
    </motion.section>
  );
}
