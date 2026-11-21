"use client";

import { useState } from "react";
import { endAnnouncement, saveAnnouncement, type AnnouncementInput } from "@/app/actions/admin/announcements";
import { DateSelectorField } from "@/components/admin/date-field";
import { SaveState, useSaveState } from "@/components/admin/saved-field";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { IconAdd, IconAnnouncement, IconError, IconInfo, IconWarning } from "@/lib/icons";

type Row = { id: string; body: string; href: string; tone: "info" | "warning" | "critical"; dismissible: boolean; programIds: number[]; levels: number[]; roles: string[]; startsAt: string; endsAt: string; live: boolean; endsAtRaw: string | null };
const TONE = { info: ["Info", IconInfo, "info-light"], warning: ["Attention", IconWarning, "warning-light"], critical: ["Critique", IconError, "destructive-light"] } as const;
const blank = (): Row => ({ id: "", body: "", href: "", tone: "info", dismissible: true, programIds: [], levels: [], roles: [], startsAt: "", endsAt: "", live: false, endsAtRaw: null });

/** Annonces bannière : édition sur place, enregistrement à la perte du focus ou au choix d'une option. */
export function AnnouncementsEditor({ rows, programs }: { rows: Row[]; programs: { id: number; name: string }[] }) {
  const [draft, setDraft] = useState<Row | null>(null);
  return (
    <div className="grid max-w-3xl gap-6">
      <div><Button onClick={() => setDraft(blank())} disabled={Boolean(draft)}><Icon icon={IconAdd} size={16} />Nouvelle annonce</Button></div>
      {draft && <AnnouncementCard key="draft" row={draft} programs={programs} onSaved={() => setDraft(null)} />}
      {rows.length ? rows.map((r) => <AnnouncementCard key={r.id} row={r} programs={programs} />) : !draft && <EmptyState icon={IconAnnouncement} title="Aucune annonce" />}
    </div>
  );
}

function AnnouncementCard({ row, programs, onSaved }: { row: Row; programs: { id: number; name: string }[]; onSaved?: () => void }) {
  const [v, setV] = useState(row);
  const [id, setId] = useState(row.id);
  const { run } = useAdminAction();
  const s = useSaveState();
  const save = async (next: Row) => {
    if (next.body.trim().length < 3) return;
    s.start();
    const input: AnnouncementInput = { id: id || undefined, body: next.body, href: next.href, tone: next.tone, dismissible: next.dismissible, programIds: next.programIds, levels: next.levels, roles: next.roles as never, startsAt: next.startsAt, endsAt: next.endsAt };
    const result = await saveAnnouncement(input);
    s.done(result.error);
    if (result.id && !id) { setId(result.id); onSaved?.(); }
  };
  const update = (patch: Partial<Row>, now = true) => { const next = { ...v, ...patch }; setV(next); if (now) void save(next); };
  const [label, icon, variant] = TONE[v.tone];
  return (
    <article className="grid gap-4 rounded-xl bg-card p-4 shadow-xs motion-ok:animate-rise md:p-6">
      <header className="flex flex-wrap items-center gap-2">
        <Badge variant={variant} size="lg"><Icon icon={icon} size={16} />{label}</Badge>
        {id && (row.live ? <Badge variant="success-light">En ligne</Badge> : <Badge variant="secondary">Hors ligne</Badge>)}
        <span className="ml-auto"><SaveState state={s.state} error={s.error} /></span>
      </header>
      <div className="grid gap-1.5">
        <div className="flex justify-between"><Label htmlFor={`b-${row.id}`}>Texte</Label><span className="text-xs tabular-nums text-muted-foreground">{v.body.length}/140</span></div>
        <Textarea id={`b-${row.id}`} rows={2} maxLength={140} value={v.body} onChange={(e) => update({ body: e.target.value }, false)} onBlur={() => void save(v)} autoFocus={!id} />
      </div>
      <div className="grid gap-1.5"><Label htmlFor={`h-${row.id}`}>Lien (facultatif)</Label><Input id={`h-${row.id}`} value={v.href} onChange={(e) => update({ href: e.target.value }, false)} onBlur={() => void save(v)} placeholder="/actualites/…" /></div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5"><Label>Ton</Label><ToggleGroup variant="outline" value={[v.tone]} onValueChange={(t) => t[0] && update({ tone: t[0] as Row["tone"] })}><ToggleGroupItem value="info">Info</ToggleGroupItem><ToggleGroupItem value="warning">Attention</ToggleGroupItem><ToggleGroupItem value="critical">Critique</ToggleGroupItem></ToggleGroup></div>
        <label className="flex min-h-9 items-center gap-2 text-sm"><Switch checked={v.dismissible && v.tone !== "critical"} disabled={v.tone === "critical"} onCheckedChange={(c) => update({ dismissible: c })} />Masquable</label>
      </div>
      <div className="grid gap-1.5">
        <Label>Public</Label>
        <ToggleGroup variant="outline" multiple value={v.programIds.map(String)} onValueChange={(ids) => update({ programIds: ids.map(Number) })} className="flex-wrap">
          {programs.map((p) => <ToggleGroupItem key={p.id} value={String(p.id)}>{p.name}</ToggleGroupItem>)}
        </ToggleGroup>
        <div className="flex flex-wrap gap-3">
          <ToggleGroup variant="outline" multiple value={v.levels.map(String)} onValueChange={(l) => update({ levels: l.map(Number) })}>{[1, 2, 3].map((n) => <ToggleGroupItem key={n} value={String(n)}>L{n}</ToggleGroupItem>)}</ToggleGroup>
          <ToggleGroup variant="outline" multiple value={v.roles} onValueChange={(r) => update({ roles: r })}><ToggleGroupItem value="member">Membres</ToggleGroupItem><ToggleGroupItem value="delegate">Délégués</ToggleGroupItem><ToggleGroupItem value="teacher">Enseignants</ToggleGroupItem></ToggleGroup>
        </div>
        <p className="text-sm text-muted-foreground">{!v.programIds.length && !v.levels.length && !v.roles.length ? "Tout le monde" : "Seulement les personnes qui correspondent"}</p>
      </div>
      <div className="flex flex-wrap gap-4">
        <DateSelectorField label="Début" value={v.startsAt || null} onChange={(d) => update({ startsAt: d ?? "" })} clearable />
        <DateSelectorField label="Fin" value={v.endsAt || null} onChange={(d) => update({ endsAt: d ?? "" })} clearable />
      </div>
      {id && row.live && <div><Button variant="ghost" onClick={() => void run(() => endAnnouncement(id), { success: "Annonce retirée", undo: () => endAnnouncement(id, row.endsAtRaw) })}>Retirer maintenant</Button></div>}
    </article>
  );
}
