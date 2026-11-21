"use client";

import Link from "next/link";
import { useState } from "react";
import { decideCard, decideProfileReport, decideQuestion, decideReport, mergeRequests, reopenCard, reopenRequests, updateRequest } from "@/app/actions/admin/reports";
import { decideWithdrawal } from "@/app/actions/withdrawals";
import { dateTime } from "@/components/admin/badges";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { EmptyState } from "@/components/empty-state";
import { REVIEW_REASONS, ReviewQueue } from "@/components/review/review-queue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { IconTodo } from "@/lib/icons";
import type { AdminResult } from "@/lib/admin-ops";

type Item = { id: string; title: string; meta?: string; [key: string]: unknown };
const text = (v: unknown) => (typeof v === "string" ? v : "");

/** Files de modération de l'administration : mêmes touches et motifs que « À valider ». */
export function ModerationView({ tab, items, subjects, shortcuts }: { tab: string; items: Item[]; subjects: { id: number; name: string }[]; shortcuts: boolean }) {
  const { run, dialog } = useAdminAction();
  const quiet = (call: () => Promise<AdminResult>) => run(call, { quiet: true }).then(() => undefined);
  const empty = <EmptyState icon={IconTodo} title="Rien dans cette file" />;
  const card = (children: React.ReactNode) => <article className="grid gap-4 rounded-xl bg-card p-4 shadow-xs md:p-6">{children}</article>;
  const reason = (n?: number) => (n ? REVIEW_REASONS[n - 1] : "");

  if (tab === "signalements") return <>{<ReviewQueue items={items} shortcuts={shortcuts} empty={empty} acceptLabel="Garder" rejectLabel="Retirer"
    openHref={(i) => (i.docId ? `/d/${text(i.docId)}` : "/admin/moderation")}
    onDecision={(i, d, n) => (d === "skip" ? undefined : quiet(() => decideReport(i.id, d === "accept" ? "reject" : "accept", reason(n))))}
    onUndo={(i) => quiet(() => decideReport(i.id, "reopen"))}
    renderPreview={(i) => card(<>
      <header className="grid gap-1"><p className="text-sm font-semibold text-muted-foreground">{text(i.kind)} · {dateTime(text(i.at))}</p><h2 className="heading">{i.docId ? <Link className="hover:underline" href={`/d/${text(i.docId)}`}>{i.title}</Link> : i.title}</h2>
        {Boolean(i.hidden) && <p className="text-sm text-warning-foreground">Masqué automatiquement</p>}</header>
      <p data-reading className="whitespace-pre-line wrap-break-word">{text(i.message)}</p>
      <p className="text-sm text-muted-foreground">{text(i.from)}</p>
    </>)} />}{dialog}</>;

  if (tab === "retraits") return <>{items.length ? <ul className="grid gap-4">{items.map((i) => <li key={i.id}><WithdrawalCard item={i} run={run} /></li>)}</ul> : empty}{dialog}</>;

  if (tab === "profils") return <>{<ReviewQueue items={items} shortcuts={shortcuts} empty={empty} acceptLabel="Garder" rejectLabel="Réinitialiser"
    openHref={(i) => `/admin/personnes/${text(i.targetId)}`}
    onDecision={(i, d, n) => (d === "skip" ? undefined : quiet(() => decideProfileReport(i.id, d === "accept" ? "reject" : "accept", reason(n))))}
    renderPreview={(i) => card(<>
      <header className="grid gap-1"><p className="text-sm font-semibold text-muted-foreground">{text(i.field)} signalé · {dateTime(text(i.at))}</p><h2 className="heading"><Link className="hover:underline" href={`/admin/personnes/${text(i.targetId)}`}>{i.title}</Link></h2></header>
      {text(i.value) && <p className="rounded-lg bg-muted p-3 whitespace-pre-line wrap-break-word">{text(i.value)}</p>}
      {text(i.reason) && <p className="text-sm"><span className="font-semibold">Motif du signalement</span> : {text(i.reason)}</p>}
      <p className="text-sm text-muted-foreground">Réinitialiser efface ce champ et bloque l’apparence 7 jours.</p>
    </>)} />}{dialog}</>;

  if (tab === "questions") return <>{<ReviewQueue items={items} shortcuts={shortcuts} empty={empty} acceptLabel="Rétablir" rejectLabel="Garder masquée"
    openHref={(i) => `/d/${text(i.docId)}`}
    onDecision={(i, d) => (d === "skip" ? undefined : quiet(() => decideQuestion(i.id, d !== "accept")))}
    onUndo={(i) => quiet(() => decideQuestion(i.id, true))}
    renderPreview={(i) => card(<><p className="text-sm font-semibold text-muted-foreground">{i.meta}</p><p data-reading className="whitespace-pre-line wrap-break-word">{text(i.body)}</p></>)} />}{dialog}</>;

  if (tab === "fiches") return <>{<ReviewQueue items={items} shortcuts={shortcuts} empty={empty} acceptLabel="Garder" rejectLabel="Retirer"
    openHref={(i) => `/d/${text(i.docId)}`}
    onDecision={(i, d) => (d === "skip" ? undefined : quiet(() => decideCard(text(i.docId), text(i.cardKey), d === "accept")))}
    onUndo={(i) => quiet(() => reopenCard(text(i.docId), text(i.cardKey)))}
    renderPreview={(i) => card(<><p className="text-sm font-semibold text-muted-foreground">{i.meta}</p><div data-reading className="grid gap-3"><p className="font-semibold">{text(i.front)}</p><p className="border-t border-border pt-3">{text(i.back)}</p></div></>)} />}{dialog}</>;

  return <>{<ReviewQueue items={items} shortcuts={shortcuts} empty={empty} acceptLabel="Garder" rejectLabel="Clore"
    openHref={() => "/demandes"}
    onDecision={(i, d) => (d === "reject" ? quiet(() => updateRequest(i.id, { close: "offtopic" })) : undefined)}
    onUndo={(i, d) => (d === "reject" ? quiet(() => reopenRequests([i.id])) : undefined)}
    renderPreview={(i) => <RequestPreview item={i} others={items.filter((o) => o.id !== i.id && o.subjectId === i.subjectId)} subjects={subjects} run={run} />} />}{dialog}</>;
}

/** Demande : corriger le texte, réattribuer la matière, fusionner un doublon, clore « déjà disponible » avec un lien. */
function RequestPreview({ item, others, subjects, run }: { item: Item; others: Item[]; subjects: { id: number; name: string }[]; run: ReturnType<typeof useAdminAction>["run"] }) {
  const [value, setValue] = useState(text(item.text));
  const [link, setLink] = useState("");
  const subjectItems = subjects.map((s) => ({ value: String(s.id), label: s.name }));
  return (
    <article className="grid gap-5 rounded-xl bg-card p-4 shadow-xs md:p-6">
      <p className="text-sm font-semibold text-muted-foreground">{item.meta} · {dateTime(text(item.at))}</p>
      <div className="grid gap-1.5"><Label htmlFor="req-text">Texte</Label><Input id="req-text" value={value} maxLength={160} onChange={(e) => setValue(e.target.value)} onBlur={() => value !== item.text && void run(() => updateRequest(item.id, { text: value }), { success: "Demande corrigée" })} /></div>
      <div className="grid gap-1.5"><Label>Matière</Label>
        <Select items={subjectItems} defaultValue={String(item.subjectId)} onValueChange={(v) => void run(() => updateRequest(item.id, { subjectId: Number(v) }), { success: "Matière réattribuée" })}>
          <SelectTrigger className="w-full" aria-label="Matière"><SelectValue /></SelectTrigger><SelectContent>{subjectItems.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select></div>
      {others.length > 0 && (
        <div className="grid gap-2"><p className="text-sm font-semibold">Doublon de…</p>
          <ul className="grid gap-1">{others.slice(0, 6).map((o) => <li key={o.id} className="flex items-center gap-2 text-sm"><span className="flex-1">{o.title}</span><Button size="sm" variant="outline" onClick={() => void run(() => mergeRequests(o.id, item.id), { success: "Fusionnées, votes additionnés" })}>Fusionner dedans</Button></li>)}</ul>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid flex-1 gap-1.5"><Label htmlFor="req-link">Déjà disponible</Label><Input id="req-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="/d/…" /></div>
        <Button variant="outline" onClick={() => void run(() => updateRequest(item.id, { close: "available", link }), { success: "Demande close", undo: () => reopenRequests([item.id]) })}>Clore avec ce lien</Button>
      </div>
    </article>
  );
}

/** Demande de retrait d'un cours publié : la justification de l'auteur, puis Retirer ou Refuser (motif obligatoire). */
function WithdrawalCard({ item, run }: { item: Item; run: ReturnType<typeof useAdminAction>["run"] }) {
  const [response, setResponse] = useState("");
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  const decide = (decision: "accept" | "refuse") => void run(() => decideWithdrawal(item.id, decision, response)).then((result) => { if (result && !result.error && !result.stepUp) setClosed(true); });
  const field = `withdrawal-${item.id}`;
  return (
    <article className="grid gap-4 rounded-xl bg-card p-4 shadow-xs md:p-6">
      <header className="grid gap-1">
        <p className="text-sm font-semibold text-muted-foreground">{item.meta} · {dateTime(text(item.at))}</p>
        <h2 className="heading"><Link className="hover:underline" href={`/d/${text(item.docId)}`}>{item.title}</Link></h2>
        {!item.published && <p className="text-sm text-muted-foreground">Déjà retiré de la publication</p>}
      </header>
      <div className="grid gap-1"><p className="text-sm font-semibold">Justification de {text(item.from)}</p><p data-reading className="whitespace-pre-line wrap-break-word">{text(item.reason)}</p></div>
      <div className="grid gap-1.5">
        <Label htmlFor={field}>Mot pour l’auteur</Label>
        <Textarea id={field} value={response} maxLength={1000} onChange={(e) => setResponse(e.target.value)} placeholder="Obligatoire pour un refus" className="text-base" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" onClick={() => decide("accept")}>Retirer de la publication</Button>
        <Button variant="outline" onClick={() => decide("refuse")} aria-disabled={response.trim().length < 3 || undefined}>Refuser</Button>
      </div>
    </article>
  );
}
