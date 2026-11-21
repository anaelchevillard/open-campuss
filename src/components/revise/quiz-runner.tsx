"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "cn";
import { playDuel } from "@/app/actions/duels";
import { submitCardsMock } from "@/app/actions/mock-exam";
import { submitMock, submitQuiz } from "@/app/actions/study";
import { Icon } from "@/components/icon";
import { Button, buttonVariants } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { celebrate } from "@/lib/celebrate";
import { IconError, IconSuccess, IconTimer, IconXp } from "@/lib/icons";
import { EASE_OUT } from "@/lib/motion";
import { toastError } from "@/lib/toast";
import { cue } from "./feedback";
import { GoalRing, RollingNumber, ThinProgress } from "./game-widgets";
import { CardText } from "./card-text";
import { SessionFrame } from "./session-frame";

export type RunnerQuestion = { question: string; choices: string[]; docId?: string; index?: number; cardId?: string; choiceIds?: string[] };

type Target = { kind: "quiz"; docId: string } | { kind: "duel"; duelId: string; docId: string } | { kind: "mock"; subjectId: number } | { kind: "cards" };

type Result = {
  score: number; total: number;
  corrections: { answer: number; explanation: string }[];
  xp?: number;
  duel?: { name: string; score: number; total: number; outcome: "ahead" | "behind" | "tied" };
};

const OUTCOME = { ahead: "Tu l’emportes", behind: "Avantage à l’autre, cette fois", tied: "Égalité" };

const clock = (ms: number) => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

/**
 * Quiz, défi et partiel blanc dans l'habillage de la séance. Le choix d'une réponse la valide et passe à la suivante :
 * aucun bouton « Suivante » à débloquer. Les réponses ne quittent le serveur qu'avec la correction.
 */
export function QuizRunner({ questions, target, title, exitHref, account, prefs, showXp = true, after, timed, againHref, notice }: {
  questions: RunnerQuestion[]; target: Target; title: string; exitHref: string; account: string;
  prefs: { sounds?: boolean; haptics?: boolean }; showXp?: boolean; after?: ReactNode; timed?: boolean; againHref?: string; notice?: string;
}) {
  const [answers, setAnswers] = useState<number[]>([]);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(0);
  const reduce = useReducedMotion();
  const current = questions[index];
  // Partiel avec ses fiches : leur texte garde mise en forme et formules
  const show = (text: string) => (target.kind === "cards" ? <CardText text={text} /> : text);
  const last = index === questions.length - 1;
  const answered = answers[index] !== undefined;

  useEffect(() => { started.current = Date.now(); }, []);
  useEffect(() => {
    if (!timed || result) return;
    const timer = setInterval(() => setElapsed(Date.now() - started.current), 1000);
    return () => clearInterval(timer);
  }, [timed, result]);

  const pick = (choice: number) => {
    setAnswers((all) => { const next = [...all]; next[index] = choice; return next; });
    if (!last) setTimeout(() => setIndex((i) => Math.min(i + 1, questions.length - 1)), reduce ? 0 : 220);
  };

  const finish = async () => {
    if (pending) return;
    setPending(true);
    const duration = Date.now() - started.current;
    try {
      let outcome: Result;
      if (target.kind === "quiz") outcome = await submitQuiz(target.docId, answers, duration);
      else if (target.kind === "duel") outcome = await playDuel(target.duelId, answers);
      else if (target.kind === "cards") outcome = await submitCardsMock(questions.map((q, i) => ({ card: q.cardId!, choices: q.choiceIds!, choice: answers[i] ?? -1 })), duration);
      else outcome = await submitMock(target.subjectId, questions.map((q, i) => ({ doc: q.docId!, index: q.index!, choice: answers[i] ?? -1 })), duration);
      setResult(outcome);
      cue("done", prefs);
      if (outcome.total && outcome.score / outcome.total >= 0.8) void celebrate("quiz", account);
    } catch {
      // Défi déjà joué depuis un autre onglet : la page montre alors le score retenu
      if (target.kind === "duel") location.reload();
      else toastError("Connexion perdue, réessaie");
    } finally {
      setPending(false);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (result || event.metaKey || event.ctrlKey || event.altKey || document.documentElement.classList.contains("no-shortcuts")) return;
      const n = Number(event.key);
      if (n >= 1 && n <= (current?.choices.length ?? 0)) { event.preventDefault(); pick(n - 1); }
      if (event.key === "Enter" && last && answered) { event.preventDefault(); void finish(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const right = (
    <>
      {timed && !result && <span className="flex items-center gap-1 tabular-nums text-muted-foreground" aria-label="Temps écoulé"><Icon icon={IconTimer} size={16} />{clock(elapsed)}</span>}
      {!result && <span className="tabular-nums text-muted-foreground">{index + 1}/{questions.length}</span>}
    </>
  );

  if (result) {
    const percent = result.total ? Math.round((result.score / result.total) * 100) : 0;
    return (
      <SessionFrame exitHref={exitHref} title={title} progress={<ThinProgress value={100} label="Terminé" />}>
        <section className="grid gap-8 py-8" aria-live="polite">
          <div className="grid justify-items-center gap-4 text-center">
            <GoalRing value={result.score} goal={result.total} size={148} stroke={12} label={`${result.score} sur ${result.total}`}>
              <span className="grid">
                <span className="text-3xl font-semibold"><RollingNumber value={result.score} from={0} /><span className="text-lg text-muted-foreground">/{result.total}</span></span>
                <span className="text-sm text-muted-foreground tabular-nums">{percent} %</span>
              </span>
            </GoalRing>
            <h2 className="title">{result.duel ? OUTCOME[result.duel.outcome] : percent >= 80 ? "Très bien" : percent >= 50 ? "Bien joué" : "Chaque essai compte"}</h2>
            {result.duel && <p role="status" className="text-muted-foreground">{result.duel.name} a fait {result.duel.score} sur {result.duel.total}</p>}
            {showXp && result.xp !== undefined && result.xp > 0 && <span className="pop inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm font-semibold tabular-nums"><Icon icon={IconXp} size={16} />+{result.xp} XP</span>}
          </div>
          {after}
          {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
          <ol className="grid gap-3">
            {questions.map((q, i) => {
              const good = result.corrections[i]?.answer === answers[i];
              return (
                <li key={i} style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }} className="rise grid gap-1.5 rounded-xl bg-card p-4 shadow-xs">
                  <p className="flex items-start gap-2 font-semibold">
                    <Icon icon={good ? IconSuccess : IconError} size={20} className={good ? "mt-0.5 text-success-foreground" : "mt-0.5 text-destructive-foreground"} label={good ? "Juste" : "Faux"} />
                    <span data-reading className="min-w-0">{show(q.question)}</span>
                  </p>
                  <div className="text-sm"><span className="text-muted-foreground">Réponse : </span>{show(q.choices[result.corrections[i]?.answer] ?? "")}</div>
                  {!good && answers[i] !== undefined && answers[i] >= 0 && <div className="text-sm text-muted-foreground">Ta réponse : {show(q.choices[answers[i]] ?? "")}</div>}
                  {result.corrections[i]?.explanation && <p className="text-sm text-pretty text-muted-foreground">{result.corrections[i].explanation}</p>}
                </li>
              );
            })}
          </ol>
          <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 bg-background/95 px-4 pt-2 pb-4 backdrop-blur sm:flex-row-reverse md:-mx-6 md:px-6">
            <Link href={exitHref} data-slot="button" className={cn(buttonVariants({ size: "lg" }), "sm:flex-1")}>Terminer</Link>
            {againHref && <Link href={againHref} data-slot="button" className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "sm:flex-1")}>Recommencer</Link>}
          </div>
        </section>
      </SessionFrame>
    );
  }

  return (
    <SessionFrame exitHref={exitHref} title={title} right={right} progress={<ThinProgress value={((answers.filter((a) => a !== undefined).length) / questions.length) * 100} label={`Question ${index + 1} sur ${questions.length}`} />}>
      <div className="flex flex-1 flex-col justify-center py-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.fieldset key={index} initial={{ opacity: 0, x: reduce ? 0 : 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduce ? 0 : -12 }} transition={{ duration: 0.2, ease: EASE_OUT }} className="mx-auto grid w-full max-w-xl gap-2">
            <legend className="mb-4 grid gap-2">
              <span className="text-sm text-muted-foreground">Question {index + 1} sur {questions.length}</span>
              <span data-reading className="text-lg font-semibold text-pretty">{show(current.question)}</span>
            </legend>
            {current.choices.map((choice, c) => {
              const chosen = answers[index] === c;
              return (
                <label key={c} className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors duration-(--dur-fast) coarse:min-h-14", chosen ? "border-brand-text bg-brand-tint" : "border-input hover-ok:bg-muted")}>
                  <input type="radio" name={`q${index}`} checked={chosen} onChange={() => pick(c)} className="sr-only" />
                  <Kbd className="hidden fine:inline-flex">{c + 1}</Kbd>
                  <span data-reading className="min-w-0 flex-1">{show(choice)}</span>
                </label>
              );
            })}
          </motion.fieldset>
        </AnimatePresence>
        {notice && <p className="mx-auto mt-6 w-full max-w-xl text-xs text-muted-foreground">{notice}</p>}
      </div>
      <div className="sticky bottom-0 -mx-4 flex items-center gap-2 bg-background/95 px-4 pt-2 pb-4 backdrop-blur md:-mx-6 md:px-6">
        {index > 0 && <Button variant="ghost" size="lg" onClick={() => setIndex((i) => i - 1)}>Précédente</Button>}
        <div className="flex-1" />
        {last && answered && <Button size="lg" pending={pending} onClick={() => void finish()}>Voir mon score</Button>}
        {!last && answered && <Button variant="outline" size="lg" onClick={() => setIndex((i) => i + 1)}>Suivante</Button>}
        {!answered && <span className="text-sm text-muted-foreground">Choisis une réponse</span>}
      </div>
    </SessionFrame>
  );
}
