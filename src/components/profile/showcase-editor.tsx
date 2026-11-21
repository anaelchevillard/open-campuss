"use client";

import Link from "next/link";
import { Icon } from "@/components/icon";
import { SettingsGroup, useDraft } from "@/components/profile/settings/autosave";
import { Sortable, SortableItem, SortableItemHandle } from "@/components/reui/sortable";
import type { SaveOutcome } from "@/components/save-guard";
import { Button } from "@/components/ui/button";
import type { ProfileShowcase } from "@/lib/db/schema";
import { badgeOf } from "@/lib/badges";
import { IconAdd, IconClose, IconCollapse, IconDragHandle, IconExpand, IconLocked } from "@/lib/icons";
import type { UnlockState } from "@/lib/unlocks";

/** Vitrine : 3 cours et 3 badges, réordonnables à la souris ou avec les boutons ; enregistrée avec le reste du profil. */
export function Showcase({ lock, docs, badges, initial, save: persist }: {
  lock: UnlockState; docs: { id: string; title: string }[]; badges: string[]; initial: ProfileShowcase; save: (value: ProfileShowcase) => Promise<SaveOutcome>;
}) {
  const [value, save] = useDraft<ProfileShowcase>("profil:vitrine", initial, persist, { same: (a, b) => JSON.stringify(a) === JSON.stringify(b) });
  const toggle = (kind: "docs" | "badges", id: string) => {
    const list = value[kind];
    save({ ...value, [kind]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id].slice(-3) });
  };
  const move = (kind: "docs" | "badges", index: number, delta: number) => {
    const list = [...value[kind]];
    const [item] = list.splice(index, 1);
    list.splice(index + delta, 0, item);
    save({ ...value, [kind]: list });
  };
  const label = (kind: "docs" | "badges", id: string) => (kind === "docs" ? docs.find((d) => d.id === id)?.title ?? "Cours retiré" : badgeOf(id)?.name ?? id);
  return (
    <SettingsGroup id="vitrine" title="Vitrine" description="Ce qui s’affiche en premier sur ton profil. Au-delà de 3, le plus ancien laisse sa place.">
      {!lock.open ? <LockLine lock={lock} /> : (["docs", "badges"] as const).map((kind) => {
        const choices = (kind === "docs" ? docs.map((d) => d.id) : badges).filter((id) => !value[kind].includes(id));
        const name = kind === "docs" ? "cours" : "badges";
        return (
          // Chaque niveau garde min-w-0 et les titres passent à la ligne (2 lignes au plus) : un titre
          // très long, même sans espace, ne peut plus élargir la page
          <div key={kind} className="grid min-w-0 gap-2">
            <span className="text-sm font-semibold">{kind === "docs" ? "3 cours" : "3 badges"} <span className="font-normal text-muted-foreground tabular-nums">· {value[kind].length}/3</span></span>
            {value[kind].length > 0 && (
              <Sortable value={value[kind]} getItemValue={(id) => id} onValueChange={(list) => save({ ...value, [kind]: list })} className="grid min-w-0 gap-1">
                {value[kind].map((id, index) => (
                  <SortableItem key={id} value={id} className="flex min-h-11 min-w-0 items-center gap-1 rounded-lg bg-muted py-1 pr-1 pl-1 text-sm">
                    <SortableItemHandle className="flex size-8 shrink-0 items-center justify-center text-muted-foreground" aria-label="Déplacer"><Icon icon={IconDragHandle} size={16} /></SortableItemHandle>
                    <span className="line-clamp-2 min-w-0 flex-1 font-semibold [overflow-wrap:anywhere]" title={label(kind, id)}>{label(kind, id)}</span>
                    <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="Monter" disabled={index === 0} onClick={() => move(kind, index, -1)}><Icon icon={IconCollapse} size={16} /></Button>
                    <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="Descendre" disabled={index === value[kind].length - 1} onClick={() => move(kind, index, 1)}><Icon icon={IconExpand} size={16} /></Button>
                    <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label={`Retirer « ${label(kind, id)} »`} onClick={() => toggle(kind, id)}><Icon icon={IconClose} size={16} /></Button>
                  </SortableItem>
                ))}
              </Sortable>
            )}
            {/* Une liste plutôt que des pastilles : un titre long tient sur deux lignes au lieu d'un bouton étiré */}
            {choices.length > 0 && (
              <ul aria-label={`Ajouter des ${name} à la vitrine`} className="grid max-h-64 min-w-0 gap-0.5 overflow-y-auto overscroll-contain rounded-lg border border-border p-1">
                {choices.map((id) => (
                  <li key={id} className="min-w-0">
                    <button type="button" onClick={() => toggle(kind, id)} className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover-ok:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                      <Icon icon={IconAdd} size={16} className="shrink-0 text-muted-foreground" />
                      <span className="line-clamp-2 min-w-0 flex-1 [overflow-wrap:anywhere]" title={label(kind, id)}>{label(kind, id)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!choices.length && !value[kind].length && <p className="text-sm text-muted-foreground">{kind === "docs" ? "Tes cours publiés pourront s’afficher ici." : "Tes badges pourront s’afficher ici."}</p>}
            {value[kind].length > 0 && <Button variant="ghost" size="sm" className="justify-self-start text-muted-foreground" onClick={() => save({ ...value, [kind]: [] })}>Vider</Button>}
          </div>
        );
      })}
    </SettingsGroup>
  );
}

function LockLine({ lock }: { lock: UnlockState }) {
  return (
    <p className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
      <Icon icon={IconLocked} size={16} className="shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1">{lock.condition}</span>
      {lock.path && <Link href={lock.path} className="font-semibold text-link underline-offset-2 hover:underline">Y aller</Link>}
    </p>
  );
}
