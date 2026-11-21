"use client";

import { useState } from "react";
import { adjustCredits, grantUnlock, setBadge } from "@/app/actions/admin/people";
import { shortDate } from "@/components/admin/badges";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { Icon } from "@/components/icon";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MANUAL_BADGES } from "@/lib/admin-actions";
import { IconAdd, IconBadge, IconCredits, IconGift } from "@/lib/icons";

type BadgeRow = { id: string; name: string; earnedAt: string; manual: boolean; revoked: boolean; revokedReason: string | null };

/** Crédits (ajustement avec motif), badges (attribuer, retirer), objets de personnalisation accordés. */
export function CreditsPanel({ personId, credits, level, badges, adjustments, unlocks }: {
  personId: string; credits: number; level: string; badges: BadgeRow[]; adjustments: { id: number; delta: number; reason: string; at: string }[]; unlocks: { item: string; source: string; at: string }[];
}) {
  const { run, askReason, dialog } = useAdminAction();
  const [delta, setDelta] = useState("");
  const [item, setItem] = useState("");
  const adjust = async () => {
    const n = Number(delta);
    if (!Number.isInteger(n) || !n) return;
    const reason = await askReason({ title: `${n > 0 ? "Ajouter" : "Retirer"} ${Math.abs(n)} crédits`, confirmLabel: "Ajuster", level: "sensitive", description: "Compté dans ses crédits, jamais dans le classement." });
    if (reason && !(await run(() => adjustCredits(personId, n, reason), { success: "Crédits ajustés" }))?.error) setDelta("");
  };
  const owned = new Set(badges.filter((b) => !b.revoked).map((b) => b.id));
  return (
    <div className="grid max-w-2xl gap-8">
      <section className="grid gap-4">
        <Stat value={credits} label="crédits" hint={level} />
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void adjust(); }}>
          <div className="grid gap-1.5"><Label htmlFor="delta">Ajuster de</Label><Input id="delta" inputMode="numeric" className="w-32" placeholder="+10 ou −10" value={delta} onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ""))} /></div>
          <Button type="submit" variant="outline"><Icon icon={IconCredits} size={16} />Ajuster</Button>
        </form>
        {adjustments.length > 0 && <ul className="grid gap-1 text-sm">{adjustments.map((a) => <li key={a.id}><span className="font-semibold tabular-nums">{a.delta > 0 ? "+" : ""}{a.delta}</span> · {a.reason} <span className="text-muted-foreground">· {shortDate(a.at)}</span></li>)}</ul>}
      </section>
      <section className="grid gap-3">
        <h3 className="heading">Badges</h3>
        <ul className="grid gap-2">{badges.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-2 text-sm">
            <Icon icon={IconBadge} size={16} className="text-muted-foreground" />
            <span className={b.revoked ? "text-muted-foreground line-through" : "font-semibold"}>{b.name}</span>
            {b.manual && <Badge variant="primary-light">Spécial</Badge>}
            <span className="text-muted-foreground">{shortDate(b.earnedAt)}</span>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={async () => {
              if (b.revoked) return void run(() => setBadge(personId, b.id, true), { success: "Badge rendu" });
              await run(() => setBadge(personId, b.id, false), { success: "Badge retiré", undo: () => setBadge(personId, b.id, true) });
            }}>{b.revoked ? "Rendre" : "Retirer"}</Button>
          </li>
        ))}</ul>
        <div className="flex flex-wrap gap-2">{MANUAL_BADGES.filter((m) => !owned.has(m.id)).map((m) => (
          <Button key={m.id} variant="outline" size="sm" onClick={() => void run(() => setBadge(personId, m.id, true), { success: `« ${m.name} » attribué`, undo: () => setBadge(personId, m.id, false) })}><Icon icon={IconAdd} size={16} />{m.name}</Button>
        ))}</div>
      </section>
      <section className="grid gap-3">
        <h3 className="heading">Objets de personnalisation</h3>
        {unlocks.length > 0 && <ul className="grid gap-1 text-sm">{unlocks.map((u) => <li key={u.item} className="flex items-center gap-2"><code className="font-mono">{u.item}</code><span className="text-muted-foreground">{u.source === "admin" ? "accordé" : "débloqué"} · {shortDate(u.at)}</span>
          {u.source === "admin" && <Button variant="ghost" size="sm" onClick={() => void run(() => grantUnlock(personId, u.item, true), { success: "Objet retiré" })}>Retirer</Button>}</li>)}</ul>}
        <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); if (!(await run(() => grantUnlock(personId, item.trim()), { success: "Objet accordé" }))?.error) setItem(""); }}>
          <div className="grid gap-1.5"><Label htmlFor="unlock">Identifiant de l’objet</Label><Input id="unlock" className="w-56 font-mono" value={item} onChange={(e) => setItem(e.target.value.toLowerCase())} maxLength={32} /></div>
          <Button type="submit" variant="outline"><Icon icon={IconGift} size={16} />Accorder</Button>
        </form>
      </section>
      {dialog}
    </div>
  );
}
