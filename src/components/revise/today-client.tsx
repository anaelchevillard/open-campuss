"use client";

import { useEffect, useState, useTransition } from "react";
import { cn } from "cn";
import { setDailyGoal, setStudyPrivacy } from "@/app/actions/habits";
import { Icon } from "@/components/icon";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { celebrate } from "@/lib/celebrate";
import type { GameSnapshot } from "@/lib/habits";
import { IconCredits, IconDone, IconRestDay, IconXp } from "@/lib/icons";
import { GOAL_CHOICES } from "@/lib/study-habits";
import { XP, XP_DAILY_CAP } from "@/lib/xp";
import { GoalRing, StreakFlame, WeekStrip } from "./game-widgets";

/** Objectif atteint plus tôt dans la journée, ailleurs : la célébration du jour part ici si elle n'est pas déjà partie. */
export function CelebrateOnce({ kind, account }: { kind: "goal" | "streak"; account: string }) {
  useEffect(() => { void celebrate(kind, account); }, [kind, account]);
  return null;
}

/** Anneau, flamme, semaine et prévision : le bloc d'état du jeu, dans la colonne de droite ou la feuille du téléphone. */
export function GameStatus({ game, tomorrow, className }: { game: GameSnapshot; tomorrow: number; className?: string }) {
  const fresh = game.streak <= 1 && game.best > game.streak;
  return (
    <div className={cn("grid gap-5", className)}>
      <div className="flex items-center gap-5">
        <GoalRing value={game.today} goal={game.goal} size={104} stroke={9}>
          <span className="grid leading-tight">
            <span className="text-2xl font-semibold tabular-nums">{game.today}</span>
            <span className="text-xs text-muted-foreground tabular-nums">sur {game.goal}</span>
          </span>
        </GoalRing>
        <div className="grid min-w-0 gap-1">
          <StreakFlame streak={game.streak} size={24} className="text-2xl" />
          <span className="text-sm text-muted-foreground">{fresh ? "Nouvelle série" : game.streak > 1 ? "jours de série" : "jour de série"}</span>
          {game.best > 1 && <span className="text-xs text-muted-foreground tabular-nums">Record : {game.best} j</span>}
        </div>
      </div>
      <WeekStrip week={game.week} />
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="grid gap-0.5"><dt className="order-2 text-muted-foreground">demain</dt><dd className="font-semibold tabular-nums">{tomorrow} {tomorrow > 1 ? "fiches" : "fiche"}</dd></div>
        <div className="grid gap-0.5"><dt className="order-2 text-muted-foreground">niveau {game.level.level} · privé</dt><dd className="flex items-center gap-1 font-semibold tabular-nums"><Icon icon={IconXp} size={16} className="text-muted-foreground" />{game.xpToday} XP aujourd’hui</dd></div>
      </dl>
      {game.vacationUntil && game.vacationUntil >= game.week[0].day && <p className="flex items-center gap-2 text-sm text-info-foreground"><Icon icon={IconRestDay} size={16} />Vacances jusqu’au {new Date(`${game.vacationUntil}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</p>}
    </div>
  );
}

/** Objectif changé sur place, enregistré sans bouton. */
export function GoalPicker({ goal }: { goal: number }) {
  const [value, setValue] = useState(String(goal));
  const [saved, setSaved] = useState(false);
  const [, start] = useTransition();
  return (
    <div className="grid gap-2">
      <Label id="goal-label" className="flex items-center gap-2">Objectif du jour{saved && <span className="rise flex items-center gap-1 text-xs text-success-foreground"><Icon icon={IconDone} size={16} />Enregistré</span>}</Label>
      <ToggleGroup aria-labelledby="goal-label" value={[value]} onValueChange={(next: string[]) => {
        const picked = next[0];
        if (!picked) return;
        setValue(picked);
        start(async () => { await setDailyGoal(Number(picked)); setSaved(true); setTimeout(() => setSaved(false), 1200); });
      }} className="flex-wrap">
        {GOAL_CHOICES.map((choice) => <ToggleGroupItem key={choice} value={String(choice)} aria-label={`${choice} par jour`} className="min-w-10 tabular-nums">{choice}</ToggleGroupItem>)}
      </ToggleGroup>
    </div>
  );
}

/** Téléphone : trois pastilles (flamme, XP du jour, mini-anneau) qui ouvrent le détail. */
export function GamePills({ game, tomorrow }: { game: GameSnapshot; tomorrow: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Série, XP et objectif du jour" className="flex w-full items-center gap-2 md:hidden">
        <span className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-card px-3 shadow-xs"><StreakFlame streak={game.streak} size={20} /></span>
        <span className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-card px-3 font-semibold tabular-nums shadow-xs"><Icon icon={IconXp} size={20} className="text-muted-foreground" />{game.xpToday}</span>
        <span className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-card px-3 shadow-xs">
          <GoalRing value={game.today} goal={game.goal} size={26} stroke={4} />
          <span className="text-sm font-semibold tabular-nums">{Math.min(game.today, game.goal)}/{game.goal}</span>
        </span>
      </button>
      <ResponsiveSheet open={open} onOpenChange={setOpen} title="Aujourd’hui">
        <div className="grid gap-6 pb-4">
          <GameStatus game={game} tomorrow={tomorrow} />
          <GoalPicker goal={game.goal} />
          <CreditsAndXp />
        </div>
      </ResponsiveSheet>
    </>
  );
}

/** Les deux monnaies, expliquées une fois : crédits publics (contribution), XP privée (révision). */
export function CreditsAndXp() {
  return (
    <div className="grid gap-3 rounded-xl bg-muted/60 p-4 text-sm">
      <p className="flex items-start gap-2"><Icon icon={IconCredits} size={20} className="text-brand-text" /><span><span className="font-semibold">Crédits</span> · publics, gagnés en partageant des cours</span></p>
      <p className="flex items-start gap-2"><Icon icon={IconXp} size={20} className="text-muted-foreground" /><span><span className="font-semibold">XP</span> · privée, gagnée en révisant : fiche {XP.cardGood}, question juste {XP.question}, séance +{XP.session}, objectif +{XP.goal}, {XP_DAILY_CAP} par jour au plus</span></p>
    </div>
  );
}

/** Partager sa révision avec ses amis : la ligue n'existe qu'entre amis qui l'ont choisi. */
export function ShareStudySwitch({ on, label = "Partager ma révision avec mes amis" }: { on: boolean; label?: string }) {
  const [checked, setChecked] = useState(on);
  const [, start] = useTransition();
  return (
    <Label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 font-normal">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={(next: boolean) => { setChecked(next); start(() => setStudyPrivacy("shareStudy", next)); }} />
    </Label>
  );
}
