"use client";

import { useState } from "react";
import { cn } from "cn";
import { showBadge } from "@/app/actions/social";
import { Icon } from "@/components/icon";
import { BadgeMedal } from "@/components/profile/badge-medal";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { badgeOf, RARITIES, type Rarity } from "@/lib/badges";
import { IconDone, IconLocked } from "@/lib/icons";
import { toast, toastError } from "@/lib/toast";

export type BadgeCell = { id: string; earnedAt: string | null; manual: boolean; value: number; target: number };

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const SHORT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const earnedOn = (iso: string) => { const d = new Date(iso); return (d.getFullYear() === new Date().getFullYear() ? SHORT : DATE).format(d); };

/** Ce qu'un badge ouvre en personnalisation, quand il ouvre quelque chose. */
const OPENS: Record<string, string> = {
  "scribe-3": "Police Caveat pour ton nom", "fiches-500": "Police JetBrains Mono pour ton nom", sentinelle: "Cadre bouclier",
  "serie-7": "Cadre de série", "carte-etudiante": "Cadre de rareté, badge à côté du nom",
  "correcteur-1": "Cadre plume", "correcteur-2": "Police du nom", "correcteur-3": "Dégradé du nom",
};

/**
 * Badges : obtenus d'abord (rareté, puis date), puis ceux à débloquer, grisés avec un cadenas et leur condition
 * (les plus proches en premier sur son propre profil, avec la progression), détail au clic.
 */
export function BadgeBoard({ cells, own, shown, fresh = [] }: { cells: BadgeCell[]; own: boolean; shown: string | null; fresh?: string[] }) {
  const [open, setOpen] = useState<BadgeCell | null>(null);
  const [current, setCurrent] = useState(shown);
  const [pending, setPending] = useState(false);
  const rarityOf = (cell: BadgeCell): Rarity => (cell.manual ? "special" : badgeOf(cell.id)!.rarity);
  const detail = open && badgeOf(open.id);
  return (
    <>
      <ul className="stagger grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
        {cells.map((cell) => {
          const badge = badgeOf(cell.id)!;
          const rarity = rarityOf(cell);
          const locked = !cell.earnedAt;
          return (
            <li key={cell.id}>
              <button type="button" onClick={() => setOpen(cell)} data-rarity={rarity}
                className={cn("grid h-full w-full justify-items-center gap-1.5 rounded-xl p-3 text-center transition-[box-shadow,transform] duration-(--dur-base) focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  locked ? "bg-muted/60 hover-ok:bg-muted" : "bg-card shadow-xs hover-ok:shadow-sm motion-ok:hover-ok:-translate-y-0.5", fresh.includes(cell.id) && "trophy pop")}>
                <BadgeMedal icon={badge.icon} rarity={rarity} hue={badge.hue} locked={locked} size={48} />
                <span className={cn("text-sm leading-tight font-semibold text-balance", locked && "text-muted-foreground")}>{badge.name}</span>
                {locked ? (
                  <span className="grid w-full gap-1">
                    {/* La condition, pour donner envie : « Publier 5 cours » ; la progression seulement sur son propre profil */}
                    <span className="flex items-start justify-center gap-1 text-xs text-muted-foreground text-pretty"><Icon icon={IconLocked} size={16} className="shrink-0" label="À débloquer :" />{badge.hint}</span>
                    {own && <>
                      <Progress value={(cell.value / cell.target) * 100} aria-label={`${cell.value} sur ${cell.target}`} className="h-1.5" />
                      <span className="text-xs tabular-nums text-muted-foreground">{cell.value} / {cell.target}</span>
                    </>}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground"><span className="font-semibold text-(--r)">{RARITIES[rarity].label}</span> · {earnedOn(cell.earnedAt!)}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <ResponsiveSheet open={Boolean(open)} onOpenChange={(value) => !value && setOpen(null)} title={detail ? detail.name : "Badge"} size="sm"
        footer={own && open?.earnedAt && detail ? (
          current === detail.id
            ? <Button variant="outline" pending={pending} onClick={async () => { setPending(true); const r = await showBadge(null); setPending(false); if (r.ok) { setCurrent(null); toast("Badge retiré de ton nom"); } else toastError(r.error); }}>Retirer de mon nom</Button>
            : <Button pending={pending} onClick={async () => { setPending(true); const r = await showBadge(detail.id); setPending(false); if (r.ok) { setCurrent(detail.id); toast("Badge affiché à côté de ton nom"); } else toastError(r.error); }}>Afficher à côté de mon nom</Button>
        ) : undefined}>
        {open && detail && (
          <div className="grid justify-items-center gap-3 pb-2 text-center" data-rarity={rarityOf(open)}>
            <BadgeMedal icon={detail.icon} rarity={rarityOf(open)} hue={detail.hue} locked={!open.earnedAt} size={72} className={open.earnedAt ? "pop" : undefined} />
            <p className="text-sm font-semibold text-(--r)">{RARITIES[rarityOf(open)].label}</p>
            <p className="text-pretty">{detail.hint}</p>
            {open.earnedAt
              ? <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Icon icon={IconDone} size={16} />Obtenu le {DATE.format(new Date(open.earnedAt))}</p>
              : !own ? <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Icon icon={IconLocked} size={16} />Pas encore débloqué</p>
              : <div className="grid w-full max-w-60 gap-1.5"><Progress value={(open.value / open.target) * 100} aria-label={`${open.value} sur ${open.target}`} className="h-2" /><p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground tabular-nums"><Icon icon={IconLocked} size={16} />{open.value} / {open.target}</p></div>}
            {OPENS[detail.id] && <p className="rounded-lg bg-muted px-3 py-2 text-sm">Débloque : {OPENS[detail.id]}</p>}
          </div>
        )}
      </ResponsiveSheet>
    </>
  );
}
