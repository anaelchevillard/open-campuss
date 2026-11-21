"use client";

import { useMemo, useState } from "react";
import { savePrefs } from "@/app/actions/social";
import { Icon } from "@/components/icon";
import { SaveScope, useStaged } from "@/components/save-guard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { homeWidgetOrder, type HomeWidgetId, type HomeWidgetsPref } from "@/lib/home-widgets";
import { IconCollapse, IconExpand, IconSettings } from "@/lib/icons";

type Widget = { id: HomeWidgetId; label: string };

/** « Personnaliser » : masquer et réordonner les widgets ; rien ne part avant Enregistrer (garde de sortie comprise). */
export function HomeWidgetsEditor({ widgets, pref }: { widgets: Widget[]; pref: HomeWidgetsPref | null }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="justify-self-start text-muted-foreground" onClick={() => setOpen(true)}>
        <Icon icon={IconSettings} size={16} />Personnaliser
      </Button>
    );
  }
  return (
    <SaveScope className="gap-3" onSaved={() => setOpen(false)}>
      <Editor widgets={widgets} pref={pref} onClose={() => setOpen(false)} />
    </SaveScope>
  );
}

function Editor({ widgets, pref, onClose }: { widgets: Widget[]; pref: HomeWidgetsPref | null; onClose: () => void }) {
  const saved = useMemo(() => ({ order: homeWidgetOrder(pref ?? undefined), hidden: pref?.hidden ?? [] }), [pref]);
  const [order, setOrder] = useState<HomeWidgetId[]>(saved.order);
  const [hidden, setHidden] = useState<HomeWidgetId[]>(saved.hidden);
  const dirty = order.join() !== saved.order.join() || [...hidden].sort().join() !== [...saved.hidden].sort().join();
  useStaged("home-widgets", dirty ? {
    save: async () => { await savePrefs({ homeWidgets: { order, hidden } }); return { ok: true }; },
    revert: () => { setOrder(saved.order); setHidden(saved.hidden); },
  } : null);
  const label = (id: HomeWidgetId) => widgets.find((w) => w.id === id)?.label ?? id;
  const move = (index: number, by: -1 | 1) => setOrder((all) => {
    const next = [...all];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    return next;
  });
  return (
    <section aria-label="Personnaliser les widgets" className="grid gap-3 rounded-xl bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Widgets de l’accueil</h2>
        {!dirty && <Button variant="ghost" size="sm" onClick={onClose}>Fermer</Button>}
      </div>
      <ol className="grid gap-1">
        {order.map((id, index) => (
          <li key={id} className="flex min-h-10 items-center gap-2">
            <Label className="flex min-w-0 flex-1 items-center gap-2 font-normal">
              <Checkbox checked={!hidden.includes(id)} onCheckedChange={(v) => setHidden((all) => v ? all.filter((h) => h !== id) : [...all, id])} />
              <span className="truncate">{label(id)}</span>
            </Label>
            <Button variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Monter : ${label(id)}`}><Icon icon={IconCollapse} size={16} /></Button>
            <Button variant="ghost" size="icon-sm" disabled={index === order.length - 1} onClick={() => move(index, 1)} aria-label={`Descendre : ${label(id)}`}><Icon icon={IconExpand} size={16} /></Button>
          </li>
        ))}
      </ol>
    </section>
  );
}
