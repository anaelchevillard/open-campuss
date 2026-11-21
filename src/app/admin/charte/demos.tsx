"use client";

import { useState } from "react";
import { AiButton } from "@/components/ai/ai-button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Icon } from "@/components/icon";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { celebrate } from "@/lib/celebrate";
import { IconAiQuiz, IconDelete, IconSend } from "@/lib/icons";
import { toast, toastUndo } from "@/lib/toast";

/** Les comportements de la charte, à essayer sur place. */
export function Demos() {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState<"danger" | "critical" | null>(null);
  const [tab, setTab] = useState("a");
  const [on, setOn] = useState(true);
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button pending={pending} onClick={() => { setPending(true); setTimeout(() => setPending(false), 1600); }}><Icon icon={IconSend} size={16} />Publier</Button>
        <Button variant="outline" onClick={() => toastUndo("Retiré des favoris", () => toast("Rétabli"))}>Toast « Annuler »</Button>
        <Button variant="outline" onClick={() => setSheet(true)}>Feuille</Button>
        <Button variant="ghost" onClick={() => setConfirm("danger")}><Icon icon={IconDelete} size={16} />Confirmation</Button>
        <Button variant="ghost" onClick={() => setConfirm("critical")}>Confirmation critique</Button>
        <Button variant="link" onClick={() => void celebrate("goal", "charte")}>Confettis</Button>
        <label className="flex items-center gap-2 text-sm">Interrupteur <Switch checked={on} onCheckedChange={setOn} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <AiButton icon={IconAiQuiz} busy={busy} onClick={() => { setBusy(true); setTimeout(() => setBusy(false), 3000); }}>{busy ? "Campuss IA prépare…" : "Générer un quiz"}</AiButton>
      </div>
      <SegmentedTabs label="Démonstration" value={tab} onValueChange={setTab} items={[{ value: "a", label: "Aujourd’hui", count: 3 }, { value: "b", label: "Partiels" }, { value: "c", label: "Ensemble" }, { value: "d", label: "Classement" }]} />
      <ResponsiveSheet open={sheet} onOpenChange={setSheet} title="Une feuille" description="Dialogue à la souris, feuille basse au toucher. Le retour système la ferme.">
        <p className="pb-4 text-muted-foreground">Contenu de la feuille.</p>
      </ResponsiveSheet>
      <ConfirmDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)} level={confirm ?? "danger"} expected="Droit civil" title={confirm === "critical" ? "Supprimer la matière Droit civil ?" : "Supprimer ce document ?"} description="Cette action ne peut pas être annulée." confirmLabel="Supprimer" onConfirm={() => setConfirm(null)} />
    </div>
  );
}
