"use client";

import Link from "next/link";
import { useState } from "react";
import { exportJournal } from "@/app/actions/admin/journal";
import { AdminGrid, useGridParams, type GridColumn } from "@/components/admin/admin-grid";
import { dateTime } from "@/components/admin/badges";
import { UrlFilters } from "@/components/admin/url-filters";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { actionKind, actionLabel, LEVEL_LABELS, type ActionLevel } from "@/lib/admin-actions";
import { IconContent, IconDownload, IconEye, IconJournal, IconLicences, IconPeople, IconSecurity, IconSiteSettings, IconFlag } from "@/lib/icons";

type Row = { id: string; at: string; actor: string; action: string; level: string | null; targetType: string | null; targetId: string | null; target: string; reason: string | null; ip: string; before: unknown; after: unknown; viewing: boolean };

const KIND_ICON = { person: IconPeople, content: IconContent, structure: IconLicences, site: IconSiteSettings, security: IconSecurity, moderation: IconFlag };
const targetHref = (r: Row) => (r.targetType === "user" && r.targetId ? `/admin/personnes/${r.targetId}` : r.targetType === "document" && r.targetId ? `/d/${r.targetId}` : null);

function Level({ level }: { level: string | null }) {
  if (!level || level === "routine" || level === "read") return null;
  return <Badge variant={level === "critical" ? "destructive-light" : "warning-light"}>{LEVEL_LABELS[level as ActionLevel]}</Badge>;
}

/** Avant/après en diff : une ligne par champ qui a changé. */
function Diff({ before, after }: { before: unknown; after: unknown }) {
  const b = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  if (!keys.length) return <p className="text-sm text-muted-foreground">Aucun détail</p>;
  const show = (v: unknown) => (v === undefined ? "—" : typeof v === "string" ? v : JSON.stringify(v));
  return (
    <dl className="grid gap-2 font-mono text-sm">{keys.map((k) => (
      <div key={k} className="grid gap-0.5 rounded-lg bg-muted p-2">
        <dt className="font-sans text-xs font-semibold text-muted-foreground">{k}</dt>
        {k in b && <dd className="break-all text-destructive-foreground">− {show(b[k])}</dd>}
        {k in a && <dd className="break-all text-success-foreground">+ {show(a[k])}</dd>}
      </div>
    ))}</dl>
  );
}

export function JournalView({ rows, admins, page, more, pageSize }: { rows: Row[]; admins: { id: string; name: string }[]; page: number; more: boolean; pageSize: number }) {
  const [open, setOpen] = useState<Row | null>(null);
  const { params } = useGridParams();
  const { run, askReason, dialog } = useAdminAction();
  const columns: GridColumn<Row>[] = [
    { id: "date", header: "Date", size: 140, cell: (r) => <span className="tabular-nums whitespace-nowrap text-muted-foreground">{dateTime(r.at)}</span> },
    { id: "admin", header: "Admin", hideBelow: "lg", cell: (r) => <span className="truncate">{r.actor}</span> },
    { id: "action", header: "Action", cell: (r) => <span className="flex items-center gap-2"><Icon icon={KIND_ICON[actionKind(r.action)]} size={16} className="text-muted-foreground" /><span className="font-semibold">{actionLabel(r.action)}</span><Level level={r.level} />{r.viewing && <Icon icon={IconEye} size={16} label="Pendant un aperçu" className="text-warning-foreground" />}</span> },
    { id: "cible", header: "Cible", cell: (r) => { const href = targetHref(r); return href ? <Link href={href} onClick={(e) => e.stopPropagation()} className="text-link hover:underline">{r.target}</Link> : <span>{r.target}</span>; } },
    { id: "motif", header: "Motif", hideBelow: "xl", cell: (r) => <span className="line-clamp-1 max-w-56 text-muted-foreground">{r.reason ?? ""}</span> },
    { id: "ip", header: "IP", hideBelow: "xl", cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.ip}</span> },
  ];
  const exportCsv = async () => {
    const reason = await askReason({ title: "Exporter le journal", description: "Les lignes filtrées, 5 000 au plus.", confirmLabel: "Exporter", level: "sensitive" });
    if (!reason) return;
    const result = await run(() => exportJournal(Object.fromEntries(params.entries()), reason), { quiet: true });
    if (!result?.data) return;
    const url = URL.createObjectURL(new Blob([`﻿${result.data}`], { type: "text/csv;charset=utf-8" }));
    Object.assign(document.createElement("a"), { href: url, download: "journal.csv" }).click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <UrlFilters placeholder="Cible, motif, admin" fields={[
          { id: "admin", label: "Admin", options: admins.map((a) => ({ value: a.id, label: a.name })) },
          { id: "type", label: "Type", options: [["person", "Personnes"], ["security", "Sécurité"], ["content", "Contenus"], ["structure", "Licences et matières"], ["moderation", "Modération"], ["site", "Site"]].map(([value, label]) => ({ value, label })) },
          { id: "periode", label: "Période", options: [["1", "24 h"], ["7", "7 jours"], ["30", "30 jours"], ["90", "90 jours"]].map(([value, label]) => ({ value, label })) },
          { id: "niveau", label: "Niveau", options: [{ value: "sensible", label: "Sensible et critique" }, { value: "critique", label: "Critique seulement" }] },
          { id: "apercu", label: "Pendant un voir comme", options: [{ value: "oui", label: "Oui" }] },
        ]} />
        <Button variant="outline" onClick={() => void exportCsv()}><Icon icon={IconDownload} size={16} />Exporter</Button>
      </div>
      <AdminGrid label="Journal" rows={rows} columns={columns} total={(page - 1) * pageSize + rows.length + (more ? 1 : 0)} page={page} pageSize={pageSize} selectable={false} selected={[]} onSelectedChange={() => undefined}
        onOpen={setOpen} mobileItem={(r) => ({ title: actionLabel(r.action), meta: `${r.target} · ${dateTime(r.at)}`, badge: <Level level={r.level} /> })}
        empty={<EmptyState icon={IconJournal} title="Rien dans le journal pour ces filtres" />} />
      <ResponsiveSheet open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)} title={open ? actionLabel(open.action) : ""} size="lg">
        {open && (
          <div className="grid gap-4 text-sm">
            <p className="text-muted-foreground">{open.actor} · {dateTime(open.at)} · {open.ip}{open.viewing ? " · pendant un aperçu" : ""}</p>
            <p><span className="font-semibold">Cible</span> : {open.target}</p>
            {open.reason && <p><span className="font-semibold">Motif</span> : {open.reason}</p>}
            <Diff before={open.before} after={open.after} />
          </div>
        )}
      </ResponsiveSheet>
      {dialog}
    </div>
  );
}
