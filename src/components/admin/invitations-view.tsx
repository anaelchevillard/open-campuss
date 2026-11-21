"use client";

import { useState } from "react";
import { createOpenLink, createTeacher, previewInvites, queueInvites, resendInvitation, revokeInvitation } from "@/app/actions/admin/create";
import { AdminGrid, type GridColumn } from "@/components/admin/admin-grid";
import { shortDate } from "@/components/admin/badges";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { ResponsiveMenu } from "@/components/responsive-menu";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { InvitationState, InviteRow } from "@/lib/invitation-rules";
import { IconCopy, IconInvite, IconLink, IconMore, IconQr, IconRefresh, IconUser, IconClose } from "@/lib/icons";
import { toast } from "@/lib/toast";

type Row = { id: string; email: string | null; name: string; programId: number | null; level: number | null; uses: number; maxUses: number; domain: string | null; state: InvitationState; createdAt: string; expiresAt: string };
type Program = { id: number; name: string };

const STATES: Record<InvitationState, [string, "secondary" | "info-light" | "success-light" | "warning-light" | "destructive-light" | "primary-light"]> = {
  queued: ["En file", "secondary"], sent: ["Envoyée", "info-light"], opened: ["Ouverte", "primary-light"], accepted: ["Acceptée", "success-light"],
  expired: ["Expirée", "warning-light"], revoked: ["Révoquée", "destructive-light"], "open-link": ["Lien ouvert", "primary-light"],
};

function ProgramLevel({ programs, program, setProgram, level, setLevel }: { programs: Program[]; program: string; setProgram: (v: string) => void; level: string; setLevel: (v: string) => void }) {
  const items = [{ value: "", label: "Au choix" }, ...programs.map((p) => ({ value: String(p.id), label: p.name }))];
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
      <div className="grid gap-1.5"><Label>Licence</Label><Select items={items} value={program} onValueChange={(v) => setProgram(String(v ?? ""))}><SelectTrigger className="w-full" aria-label="Licence"><SelectValue /></SelectTrigger><SelectContent>{items.map((i) => <SelectItem key={i.value || "none"} value={i.value}>{i.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid gap-1.5"><Label>Année</Label><ToggleGroup variant="outline" spacing={0} value={[level]} onValueChange={(v) => setLevel(v[0] ?? "")}>{["1", "2", "3"].map((l) => <ToggleGroupItem key={l} value={l}>L{l}</ToggleGroupItem>)}</ToggleGroup></div>
    </div>
  );
}

export function InvitationsView({ rows, programs, defaultProgram, defaultDomain, queue, subjects }: {
  rows: Row[]; programs: Program[]; defaultProgram: number | null; defaultDomain: string; queue: { queued: number; sentToday: number; limit: number };
  subjects: { id: number; name: string; level: number; programId: number }[];
}) {
  const { run, askReason, dialog, pending } = useAdminAction();
  const [sheet, setSheet] = useState<null | "mail" | "link" | "teacher">(null);
  const [text, setText] = useState("");
  const [program, setProgram] = useState(defaultProgram ? String(defaultProgram) : "");
  const [level, setLevel] = useState("1");
  const [role, setRole] = useState<"member" | "delegate">("member");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{ rows: InviteRow[]; today: number; later: number } | null>(null);
  const [link, setLink] = useState({ maxUses: "200", days: "14", domain: defaultDomain });
  const [qr, setQr] = useState<{ url: string; image: string } | null>(null);
  const [teacher, setTeacher] = useState<{ name: string; email: string; subjects: number[] }>({ name: "", email: "", subjects: [] });
  const programName = (id: number | null) => programs.find((p) => p.id === id)?.name ?? "—";
  const ok = preview?.rows.filter((r) => r.status === "ok").length ?? 0;

  const sendAll = async () => {
    const reason = await askReason({ title: `Inviter ${ok} personne${ok > 1 ? "s" : ""}`, confirmLabel: "Envoyer", level: "sensitive", description: preview?.later ? `${preview.today} partent aujourd’hui, ${preview.later} ensuite, sous le plafond de ${queue.limit} mails par jour.` : undefined });
    if (!reason) return;
    const result = await run(() => queueInvites({ text, programId: program ? Number(program) : null, level: level ? Number(level) : null, role, message, reason }), { quiet: true });
    if (result?.data) {
      toast(result.data.later ? `${result.data.queued} en file, envoi complet ${result.data.later > queue.limit ? "dans quelques jours" : "demain"}` : `${result.data.queued} invitations en file`);
      setSheet(null); setText(""); setPreview(null);
    }
  };
  const makeLink = async () => {
    const reason = await askReason({ title: "Créer un lien ouvert", confirmLabel: "Créer", level: "sensitive", description: "Toute personne qui a le lien pourra créer un compte dans la licence choisie." });
    if (!reason) return;
    const result = await run(() => createOpenLink({ programId: program ? Number(program) : null, level: level ? Number(level) : null, maxUses: Number(link.maxUses) || 1, days: Number(link.days) || 14, allowedDomain: link.domain, reason }), { quiet: true });
    if (!result?.data) return;
    const QR = await import("qrcode");
    setQr({ url: result.data.url, image: await QR.toDataURL(result.data.url, { margin: 1, width: 640 }) });
    setSheet(null);
  };

  const columns: GridColumn<Row>[] = [
    { id: "qui", header: "Invitation", cell: (r) => r.email ? <span className="grid"><span className="font-semibold">{r.name || r.email}</span>{r.name && <span className="text-muted-foreground">{r.email}</span>}</span> : <span className="flex items-center gap-2 font-semibold"><Icon icon={IconLink} size={16} />Lien ouvert{r.domain ? ` · @${r.domain}` : ""}</span> },
    { id: "etat", header: "État", cell: (r) => <Badge variant={STATES[r.state][1]} size="lg">{STATES[r.state][0]}</Badge> },
    { id: "licence", header: "Licence", cell: (r) => `${programName(r.programId)}${r.level ? ` · L${r.level}` : ""}` },
    { id: "usage", header: "Utilisations", numeric: true, hideBelow: "lg", cell: (r) => (r.email ? "" : `${r.uses} / ${r.maxUses}`) },
    { id: "date", header: "Créée", numeric: true, hideBelow: "lg", cell: (r) => shortDate(r.createdAt) },
    { id: "fin", header: "Expire", numeric: true, cell: (r) => shortDate(r.expiresAt) },
    { id: "actions", header: "", size: 48, cell: (r) => (
      <ResponsiveMenu title="Invitation" trigger={<Button variant="ghost" size="icon-sm" aria-label="Actions"><Icon icon={IconMore} size={16} /></Button>} items={[
        ...(r.email && r.state !== "accepted" ? [{ label: "Renvoyer", icon: IconRefresh, onSelect: () => void run(() => resendInvitation(r.id)) }] : []),
        ...(r.state !== "revoked" && r.state !== "accepted" ? [{ label: "Révoquer", icon: IconClose, danger: true, onSelect: () => void run(() => revokeInvitation(r.id), { success: "Invitation révoquée", undo: () => revokeInvitation(r.id, true) }) }] : []),
      ]} />
    ) },
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setSheet("mail")}><Icon icon={IconInvite} size={16} />Inviter par mail</Button>
        <Button variant="outline" onClick={() => setSheet("link")}><Icon icon={IconQr} size={16} />Lien ouvert et QR</Button>
        <Button variant="ghost" onClick={() => setSheet("teacher")}><Icon icon={IconUser} size={16} />Inviter un enseignant</Button>
        {queue.queued > 0 && <span className="text-sm text-muted-foreground tabular-nums">{queue.queued} en file · {queue.sentToday}/{queue.limit} envoyées aujourd’hui</span>}
      </div>
      <AdminGrid label="Invitations" rows={rows} columns={columns} total={rows.length} page={1} pageSize={rows.length || 1} selectable={false} selected={[]} onSelectedChange={() => undefined}
        mobileItem={(r) => ({ title: r.email ? r.name || r.email : "Lien ouvert", meta: `${programName(r.programId)} · expire le ${shortDate(r.expiresAt)}`, badge: <Badge variant={STATES[r.state][1]}>{STATES[r.state][0]}</Badge> })}
        onOpen={() => undefined}
        empty={<EmptyState icon={IconInvite} title="Aucune invitation" action={<Button variant="outline" onClick={() => setSheet("mail")}>Inviter par mail</Button>} />} />

      <ResponsiveSheet open={sheet === "mail"} onOpenChange={(o) => { if (!o) { setSheet(null); setPreview(null); } }} title="Inviter par mail" size="lg"
        footer={preview ? <><Button variant="outline" onClick={() => setPreview(null)}>Modifier la liste</Button><Button pending={pending} onClick={() => void sendAll()} disabled={!ok}>Envoyer {ok} invitation{ok > 1 ? "s" : ""}</Button></>
          : <Button pending={pending} onClick={async () => { const r = await run(() => previewInvites(text), { quiet: true }); if (r?.data) setPreview(r.data); }}>Voir l’aperçu</Button>}>
        {preview ? (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">{ok} à inviter{preview.later ? ` · ${preview.today} aujourd’hui, ${preview.later} ensuite` : ""}</p>
            <div className="max-h-[50dvh] overflow-auto rounded-xl bg-card shadow-xs">
              <table className="w-full text-sm"><thead className="bg-muted text-left"><tr><th className="px-3 py-2 font-semibold">Adresse</th><th className="px-3 py-2 font-semibold">Nom</th><th className="px-3 py-2 font-semibold">État</th></tr></thead>
                <tbody>{preview.rows.map((r) => (
                  <tr key={r.line} className={r.status === "invalid" ? "text-destructive-foreground" : r.status === "ok" ? "" : "text-muted-foreground"}>
                    <td className="px-3 py-1.5 break-all">{r.email || "—"}</td><td className="px-3 py-1.5">{r.name}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{r.status === "ok" ? "À inviter" : r.status === "invalid" ? r.problem : r.status === "registered" ? "Déjà inscrite" : "Doublon fusionné"}</td>
                  </tr>
                ))}</tbody></table>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-1.5"><Label htmlFor="inv-list">Adresses</Label><Textarea id="inv-list" rows={6} className="font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder={"lea.martin@etu.exemple.fr\nadresse;nom;licence;année"} /></div>
            <ProgramLevel programs={programs} program={program} setProgram={setProgram} level={level} setLevel={setLevel} />
            <div className="grid gap-1.5"><Label>Rôle</Label><ToggleGroup variant="outline" value={[role]} onValueChange={(v) => v[0] && setRole(v[0] as "member" | "delegate")}><ToggleGroupItem value="member">Membre</ToggleGroupItem><ToggleGroupItem value="delegate">Délégué</ToggleGroupItem></ToggleGroup></div>
            <div className="grid gap-1.5"><Label htmlFor="inv-msg">Message (facultatif)</Label><Textarea id="inv-msg" rows={2} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} /></div>
          </div>
        )}
      </ResponsiveSheet>

      <ResponsiveSheet open={sheet === "link"} onOpenChange={(o) => !o && setSheet(null)} title="Lien ouvert" footer={<Button pending={pending} onClick={() => void makeLink()}>Créer le lien</Button>}>
        <div className="grid gap-4">
          <ProgramLevel programs={programs} program={program} setProgram={setProgram} level={level} setLevel={setLevel} />
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="l-uses">Utilisations</Label><Input id="l-uses" inputMode="numeric" value={link.maxUses} onChange={(e) => setLink({ ...link, maxUses: e.target.value.replace(/\D/g, "") })} /></div>
            <div className="grid gap-1.5"><Label htmlFor="l-days">Valable (jours)</Label><Input id="l-days" inputMode="numeric" value={link.days} onChange={(e) => setLink({ ...link, days: e.target.value.replace(/\D/g, "") })} /></div>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="l-domain">Domaine imposé</Label><Input id="l-domain" value={link.domain} onChange={(e) => setLink({ ...link, domain: e.target.value.trim().toLowerCase() })} placeholder="etu.exemple.fr" /></div>
        </div>
      </ResponsiveSheet>

      <ResponsiveSheet open={sheet === "teacher"} onOpenChange={(o) => !o && setSheet(null)} title="Inviter un enseignant" footer={<Button pending={pending} onClick={async () => {
        const reason = await askReason({ title: "Créer l’espace enseignant", confirmLabel: "Inviter", level: "sensitive" });
        if (reason && !(await run(() => createTeacher({ ...teacher, subjectIds: teacher.subjects, reason })))?.error) { setSheet(null); setTeacher({ name: "", email: "", subjects: [] }); }
      }}>Inviter</Button>}>
        <div className="grid gap-4">
          <div className="grid gap-1.5"><Label htmlFor="t-name">Nom</Label><Input id="t-name" value={teacher.name} onChange={(e) => setTeacher({ ...teacher, name: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label htmlFor="t-mail">Adresse</Label><Input id="t-mail" type="email" value={teacher.email} onChange={(e) => setTeacher({ ...teacher, email: e.target.value })} /></div>
          <fieldset className="grid max-h-60 gap-1 overflow-y-auto"><legend className="mb-1 text-sm font-semibold">Matières</legend>
            {subjects.filter((s) => !program || s.programId === Number(program)).map((s) => (
              <label key={s.id} className="flex min-h-9 items-center gap-2 text-sm"><Checkbox checked={teacher.subjects.includes(s.id)} onCheckedChange={(v) => setTeacher({ ...teacher, subjects: v ? [...teacher.subjects, s.id] : teacher.subjects.filter((x) => x !== s.id) })} />L{s.level} · {s.name}</label>
            ))}
          </fieldset>
        </div>
      </ResponsiveSheet>

      <Dialog open={Boolean(qr)} onOpenChange={(o) => !o && setQr(null)}>
        <DialogContent className="flex h-dvh max-h-dvh w-full max-w-none flex-col items-center justify-center gap-6 rounded-none sm:max-w-none">
          <DialogTitle>Scanne pour créer ton compte</DialogTitle>
          {qr && <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.image} alt="QR du lien d’invitation" className="aspect-square w-[min(80vw,60dvh)] rounded-xl bg-white p-3" />
            <div className="flex max-w-xl items-center gap-2 rounded-lg bg-muted p-3"><code className="min-w-0 flex-1 font-mono text-sm break-all">{qr.url}</code>
              <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(qr.url); toast("Lien copié"); }}><Icon icon={IconCopy} size={16} />Copier</Button></div>
            <p className="text-sm text-muted-foreground">Ce lien ne sera plus affiché : copie-le maintenant.</p>
          </>}
        </DialogContent>
      </Dialog>
      {dialog}
    </div>
  );
}
