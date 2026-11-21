"use client";

import { useState, useTransition } from "react";
import { cn } from "cn";
import { postReviewComment } from "@/app/actions/documents";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { IconComment, IconError, IconPublished, IconReviewed, IconSend, IconToFix, IconPending, IconHiddenByReports, type IconData } from "@/lib/icons";
import { reasonLabel } from "@/lib/review-reasons";

export type ThreadEvent = { id: string; kind: string; reasonCode: number | null; body: string; createdAt: string; authorId: string | null; authorName: string | null };

const KIND: Record<string, { label: string; icon: IconData; tone: string }> = {
  sent: { label: "Envoyé en relecture", icon: IconPending, tone: "text-info-foreground" },
  resubmitted: { label: "Renvoyé en relecture", icon: IconPending, tone: "text-info-foreground" },
  published: { label: "Publié", icon: IconPublished, tone: "text-success-foreground" },
  post_ok: { label: "Relu après publication", icon: IconReviewed, tone: "text-success-foreground" },
  rejected: { label: "À corriger", icon: IconToFix, tone: "text-warning-foreground" },
  removed: { label: "Retiré", icon: IconHiddenByReports, tone: "text-destructive" },
  comment: { label: "Message", icon: IconComment, tone: "text-muted-foreground" },
};

const when = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/**
 * Fil auteur ↔ relecteur : décisions et messages dans l'ordre, puis le champ de réponse. Les messages de la personne qui lit
 * sont alignés à droite, comme une conversation.
 */
export function ReviewThreadView({ documentId, events: initial, viewerId, compact, canReply = true, waitingSince }: { documentId: string; events: ThreadEvent[]; viewerId?: string; compact?: boolean; canReply?: boolean; waitingSince?: string | null }) {
  const [events, setEvents] = useState(initial);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const send = () => {
    const body = text.trim();
    if (!body) return;
    setError("");
    start(async () => {
      const result = await postReviewComment(documentId, body);
      if ("error" in result) { setError(result.error); return; }
      setText("");
      if (result.events) setEvents(result.events);
    });
  };
  return (
    <div className={cn("grid", compact ? "gap-3" : "gap-4")}>
      {events.length > 0 && (
        <ol className="stagger grid gap-3" aria-label="Historique de relecture">
          {events.map((e) => {
            const k = KIND[e.kind] ?? KIND.comment;
            const mine = e.kind === "comment" && viewerId && e.authorId === viewerId;
            const reason = reasonLabel(e.reasonCode);
            if (e.kind === "comment") return (
              <li key={e.id} className={cn("grid max-w-[85%] gap-1", mine ? "justify-self-end" : "justify-self-start")}>
                <span className={cn("text-xs text-muted-foreground", mine && "text-right")}>{mine ? "Toi" : e.authorName ?? "Ancien compte"} · {when(e.createdAt)}</span>
                <p className={cn("rounded-xl px-3 py-2 text-sm text-pretty whitespace-pre-line", mine ? "bg-brand-tint text-foreground" : "bg-muted")}>{e.body}</p>
              </li>
            );
            return (
              <li key={e.id} className="flex items-start gap-2 text-sm">
                <Icon icon={k.icon} size={16} className={cn("mt-0.5", k.tone)} />
                <span className="grid min-w-0 gap-0.5">
                  <span><span className="font-semibold">{k.label}</span>{reason && <> · {reason}</>}</span>
                  {e.body && <span className="text-pretty whitespace-pre-line">{e.body}</span>}
                  <span className="text-xs text-muted-foreground">{e.authorName ?? "Relecteur"} · {when(e.createdAt)}</span>
                </span>
              </li>
            );
          })}
          {waitingSince && (
            <li className="flex items-start gap-2 text-sm text-muted-foreground">
              <Icon icon={IconPending} size={16} className="mt-0.5 text-info-foreground" />
              <span>En attente de relecture depuis le {when(waitingSince)}</span>
            </li>
          )}
        </ol>
      )}
      {canReply && (
        <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); send(); }}>
          <label htmlFor={`thread-${documentId}`} className="sr-only">Message</label>
          <Textarea id={`thread-${documentId}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={compact ? 2 : 3}
            placeholder={events.length ? "Répondre" : "Écrire au relecteur"} className="min-h-0 resize-none text-base"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }} aria-invalid={error ? true : undefined} />
          {error && <p className="flex items-center gap-1.5 text-sm text-destructive"><Icon icon={IconError} size={16} />{error}</p>}
          <div className="flex justify-end"><Button type="submit" variant="outline" size="sm" pending={pending} disabled={!text.trim() && !pending}><Icon icon={IconSend} size={16} />Envoyer</Button></div>
        </form>
      )}
    </div>
  );
}
