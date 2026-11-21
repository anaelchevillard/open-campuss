"use client";

import { useState } from "react";
import { acceptVerifiedDomains, bulkMessage, bulkProgram, decideRequests, exportPeople, undoRequests } from "@/app/actions/admin/people";
import { suspendUsers } from "@/app/actions/admin/access";
import { AdminGrid, useGridParams, type GridColumn } from "@/components/admin/admin-grid";
import { ago, DomainBadge, PersonStatus, roleLabel, shortDate } from "@/components/admin/badges";
import { BulkBar } from "@/components/admin/bulk-bar";
import { SuspendFields, type SuspendValue } from "@/components/admin/suspend-fields";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { UrlFilters, type UrlFilterField } from "@/components/admin/url-filters";
import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { DomainVerdict } from "@/lib/domains";
import { IconDomainOk, IconDownload, IconMail, IconPeople, IconProgram, IconSuspend, IconSuccess, IconRejected } from "@/lib/icons";

export type PersonGridRow = {
  id: string; name: string; email: string; status: string; role: string; programId: number | null; level: number | null; avatarKey: string | null;
  createdAt: Date; lastLoginAt: Date | null; suspended: boolean; isOwner: boolean; message: string; domain: DomainVerdict | null; deletionScheduledAt: Date | null;
};

export function PeopleView({ rows, total, page, pageSize, tab, programs, inviters, verifiedCount, now }: {
  rows: PersonGridRow[]; total: number; page: number; pageSize: number; tab: string;
  programs: { id: number; name: string }[]; inviters: { id: string; name: string }[]; verifiedCount: number; now: number;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [sheet, setSheet] = useState<null | "program" | "message" | "suspend">(null);
  const { set } = useGridParams();
  const { run, askReason, dialog, pending } = useAdminAction();
  const programName = (id: number | null) => programs.find((p) => p.id === id)?.name ?? "Sans licence";
  const pendingSelected = rows.filter((r) => selected.includes(r.id) && r.status === "pending").map((r) => r.id);

  const columns: GridColumn<PersonGridRow>[] = [
    { id: "nom", header: "Personne", sortable: true, size: 280, cell: (r) => (
      <span className="flex min-w-0 items-center gap-3"><Avatar user={r} size={32} /><span className="grid min-w-0"><span className="truncate font-semibold">{r.name}</span><span className="truncate text-muted-foreground">{r.email}</span></span></span>
    ) },
    ...(tab === "attente"
      ? [{ id: "domaine", header: "Domaine", cell: (r: PersonGridRow) => r.domain && <DomainBadge verdict={r.domain} /> }, { id: "message", header: "Message", hideBelow: "xl" as const, cell: (r: PersonGridRow) => <span className="line-clamp-2 max-w-64 text-muted-foreground">{r.message || "—"}</span> }]
      : [{ id: "etat", header: "État", cell: (r: PersonGridRow) => <PersonStatus status={r.status} suspended={r.suspended} deletion={Boolean(r.deletionScheduledAt)} /> }, { id: "role", header: "Rôle", cell: (r: PersonGridRow) => roleLabel(r.role, r.isOwner) }]),
    { id: "licence", header: "Licence", sortable: true, cell: (r) => <span className="whitespace-nowrap">{programName(r.programId)}{r.level ? ` · L${r.level}` : ""}</span> },
    { id: "inscription", header: "Inscription", sortable: true, numeric: true, hideBelow: "lg", cell: (r) => shortDate(r.createdAt) },
    { id: "connexion", header: "Connexion", sortable: true, numeric: true, cell: (r) => <span className="text-muted-foreground">{ago(r.lastLoginAt, now)}</span> },
    // Une demande se traite d'un clic sur sa ligne, sans passer par la sélection
    { id: "decision", header: "", cell: (r) => r.status === "pending" && (
      <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        <Button size="sm" pending={pending} onClick={() => void decide([r.id], "accept")}>Accepter</Button>
        <Button size="sm" variant="ghost" onClick={() => void decide([r.id], "reject")}>Refuser</Button>
      </span>
    ) },
  ];

  const fields: UrlFilterField[] = [
    { id: "etat", label: "État", options: [["active", "Actif"], ["pending", "En attente"], ["unverified", "Mail non confirmé"], ["disabled", "Désactivé"], ["rejected", "Refusé"], ["banned", "Banni"]].map(([value, label]) => ({ value, label })) },
    { id: "role", label: "Rôle", options: [["member", "Membre"], ["delegate", "Délégué"], ["teacher", "Enseignant"], ["admin", "Admin"]].map(([value, label]) => ({ value, label })) },
    { id: "licence", label: "Licence", options: programs.map((p) => ({ value: String(p.id), label: p.name })) },
    { id: "annee", label: "Année", options: [1, 2, 3].map((n) => ({ value: String(n), label: `L${n}` })) },
    { id: "2fa", label: "Second facteur", options: [{ value: "oui", label: "Activé" }, { value: "non", label: "Absent" }] },
    { id: "jamais", label: "Jamais connecté", options: [{ value: "oui", label: "Jamais connecté" }] },
    { id: "inactif", label: "Inactif depuis", options: [["30", "30 jours"], ["90", "90 jours"], ["180", "6 mois"], ["365", "1 an"]].map(([value, label]) => ({ value, label })) },
    ...(inviters.length ? [{ id: "invitepar", label: "Invité par", options: inviters.map((i) => ({ value: i.id, label: i.name })) }] : []),
  ];

  const decide = async (ids: string[], decision: "accept" | "reject") => {
    const result = await run(() => decideRequests(ids, decision), { success: decision === "accept" ? `${ids.length} accepté${ids.length > 1 ? "s" : ""}` : `${ids.length} refusé${ids.length > 1 ? "s" : ""}`, undo: () => undoRequests(ids) });
    if (!result?.error) setSelected([]);
  };

  const exportCsv = async () => {
    const reason = await askReason({ title: "Exporter en CSV", description: `${selected.length} personne${selected.length > 1 ? "s" : ""} : nom, adresse, licence, état.`, confirmLabel: "Exporter", level: "sensitive" });
    if (!reason) return;
    const result = await run(() => exportPeople(selected, reason), { quiet: true });
    if (!result?.data) return;
    const url = URL.createObjectURL(new Blob([`﻿${result.data}`], { type: "text/csv;charset=utf-8" }));
    Object.assign(document.createElement("a"), { href: url, download: "personnes.csv" }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <UrlFilters fields={fields} placeholder="Nom, adresse ou code ami" />
        {tab === "attente" && verifiedCount > 0 && (
          <Button variant="outline" pending={pending} onClick={() => void run(() => acceptVerifiedDomains(), { success: "Domaines vérifiés acceptés" })}>
            <Icon icon={IconDomainOk} size={16} />Accepter les domaines vérifiés ({verifiedCount})
          </Button>
        )}
      </div>
      <AdminGrid
        label="Personnes" rows={rows} columns={columns} total={total} page={page} pageSize={pageSize} selected={selected} onSelectedChange={setSelected}
        href={(r) => `/admin/personnes/${r.id}`} onOpen={(r) => set({ fiche: r.id, vue: null }, false, true)}
        mobileItem={(r) => ({ title: r.name, meta: `${programName(r.programId)}${r.level ? ` · L${r.level}` : ""} · ${ago(r.lastLoginAt, now)}`, media: <Avatar user={r} size={32} />, badge: r.domain ? <DomainBadge verdict={r.domain} /> : r.suspended || r.status !== "active" ? <PersonStatus status={r.status} suspended={r.suspended} /> : null })}
        empty={<EmptyState icon={IconPeople} title={tab === "attente" ? "Aucune demande en attente" : "Personne ne correspond"} action={<Button variant="outline" onClick={() => set({ q: null, etat: null, role: null, licence: null, annee: null, "2fa": null, jamais: null, inactif: null, invitepar: null })}>Retirer les filtres</Button>} />}
      />
      {selected.length > 0 && (
        <BulkBar count={selected.length} onClear={() => setSelected([])}>
          {pendingSelected.length > 0 && <>
            <Button size="sm" pending={pending} onClick={() => void decide(pendingSelected, "accept")}><Icon icon={IconSuccess} size={16} />Accepter</Button>
            <Button size="sm" variant="outline" onClick={() => void decide(pendingSelected, "reject")}><Icon icon={IconRejected} size={16} />Refuser</Button>
          </>}
          <Button size="sm" variant="ghost" onClick={() => setSheet("program")}><Icon icon={IconProgram} size={16} />Licence ou année</Button>
          <Button size="sm" variant="ghost" onClick={() => setSheet("message")}><Icon icon={IconMail} size={16} />Message</Button>
          <Button size="sm" variant="ghost" onClick={() => setSheet("suspend")}><Icon icon={IconSuspend} size={16} />Suspendre</Button>
          <Button size="sm" variant="ghost" onClick={() => void exportCsv()}><Icon icon={IconDownload} size={16} />CSV</Button>
        </BulkBar>
      )}
      <ProgramSheet open={sheet === "program"} onClose={() => setSheet(null)} programs={programs} onSubmit={async (programId, level, reason, warn) => { const r = await run(() => bulkProgram(selected, programId, level, reason, warn), { success: "Licence ou année modifiée" }); if (r && !r.error) { setSheet(null); setSelected([]); } }} />
      <MessageSheet open={sheet === "message"} onClose={() => setSheet(null)} count={selected.length} onSubmit={async (title, body) => { const r = await run(() => bulkMessage(selected, title, body), { success: "Message envoyé" }); if (r && !r.error) { setSheet(null); setSelected([]); } }} />
      <SuspendSheet open={sheet === "suspend"} onClose={() => setSheet(null)} count={selected.length} onSubmit={async (v) => { const r = await run(() => suspendUsers(selected, v.preset, v.date, v.reason, v.message), { success: "Suspendu" }); if (r && !r.error) { setSheet(null); setSelected([]); } }} />
      {dialog}
    </div>
  );
}

function ProgramSheet({ open, onClose, programs, onSubmit }: { open: boolean; onClose: () => void; programs: { id: number; name: string }[]; onSubmit: (programId: number | null, level: number | null, reason: string, warn: boolean) => Promise<void> }) {
  const [program, setProgram] = useState("same");
  const [warn, setWarn] = useState(false);
  const [level, setLevel] = useState("same");
  const [reason, setReason] = useState("");
  const programItems = [{ value: "same", label: "Inchangée" }, ...programs.map((p) => ({ value: String(p.id), label: p.name }))];
  const levelItems = [{ value: "same", label: "Inchangée" }, ...[1, 2, 3].map((n) => ({ value: String(n), label: `L${n}` }))];
  return (
    <ResponsiveSheet open={open} onOpenChange={(o) => !o && onClose()} title="Licence ou année" footer={<Button onClick={() => void onSubmit(program === "same" ? null : Number(program), level === "same" ? null : Number(level), reason, warn)}>Appliquer</Button>}>
      <div className="grid gap-4">
        <div className="grid gap-1.5"><Label>Licence</Label><Select items={programItems} value={program} onValueChange={(v) => setProgram(String(v))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{programItems.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid gap-1.5"><Label>Année</Label><Select items={levelItems} value={level} onValueChange={(v) => setLevel(String(v))}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{levelItems.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid gap-1.5"><Label htmlFor="bulk-reason">Motif <span className="font-normal text-muted-foreground">(facultatif)</span></Label><Textarea id="bulk-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></div>
        <Label className="flex items-center gap-2 font-normal"><Checkbox checked={warn} onCheckedChange={(v) => setWarn(v === true)} />Prévenir les personnes</Label>
      </div>
    </ResponsiveSheet>
  );
}

function MessageSheet({ open, onClose, count, onSubmit }: { open: boolean; onClose: () => void; count: number; onSubmit: (title: string, body: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  return (
    <ResponsiveSheet open={open} onOpenChange={(o) => !o && onClose()} title={`Message à ${count} personne${count > 1 ? "s" : ""}`} footer={<Button onClick={() => void onSubmit(title, body)}>Envoyer</Button>}>
      <div className="grid gap-4">
        <div className="grid gap-1.5"><Label htmlFor="msg-title">Titre</Label><Input id="msg-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} /></div>
        <div className="grid gap-1.5"><Label htmlFor="msg-body">Texte</Label><Textarea id="msg-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} /></div>
      </div>
    </ResponsiveSheet>
  );
}

export function SuspendSheet({ open, onClose, count, onSubmit }: { open: boolean; onClose: () => void; count: number; onSubmit: (value: SuspendValue) => Promise<void> }) {
  const [value, setValue] = useState<SuspendValue>({ preset: "7j", date: null, reason: "", message: "" });
  return (
    <ResponsiveSheet open={open} onOpenChange={(o) => !o && onClose()} title={count > 1 ? `Suspendre ${count} personnes` : "Suspendre"} footer={<Button variant="danger" onClick={() => void onSubmit(value)}>Suspendre</Button>}>
      <SuspendFields value={value} onChange={setValue} />
    </ResponsiveSheet>
  );
}
