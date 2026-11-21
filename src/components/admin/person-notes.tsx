"use client";

import { useState } from "react";
import { addNote, deleteNote, pinNote } from "@/app/actions/admin/people";
import { dateTime } from "@/components/admin/badges";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { IconDelete, IconPin, IconPrivacy } from "@/lib/icons";

/** Fil de notes internes : épinglables, incluses dans l'export de la personne. */
export function NotesPanel({ personId, notes }: { personId: string; notes: { id: string; body: string; pinned: boolean; author: string; at: string }[] }) {
  const { run, dialog, pending } = useAdminAction();
  const [body, setBody] = useState("");
  return (
    <div className="grid max-w-2xl gap-6">
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Icon icon={IconPrivacy} size={16} />La personne peut demander à lire cette note.</p>
      <form className="grid gap-2" onSubmit={async (e) => { e.preventDefault(); if (!(await run(() => addNote(personId, body), { quiet: true }))?.error) setBody(""); }}>
        <Textarea aria-label="Nouvelle note" rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ajouter une note" />
        <div><Button type="submit" variant="outline" pending={pending} disabled={!body.trim()}>Ajouter la note</Button></div>
      </form>
      <ul className="grid gap-3">{notes.map((n) => (
        <li key={n.id} className="grid gap-1 rounded-xl bg-card p-4 shadow-xs">
          <p className="whitespace-pre-line text-sm wrap-break-word">{n.body}</p>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span className="flex-1">{n.author} · {dateTime(n.at)}</span>
            <Button variant="ghost" size="icon-sm" aria-label={n.pinned ? "Désépingler" : "Épingler"} aria-pressed={n.pinned} onClick={() => void run(() => pinNote(n.id, !n.pinned), { quiet: true })}><Icon icon={IconPin} size={16} className={n.pinned ? "text-brand-text [&_path]:fill-current" : undefined} /></Button>
            <Button variant="ghost" size="icon-sm" aria-label="Supprimer la note" onClick={() => void run(() => deleteNote(n.id), { success: "Note supprimée", undo: () => addNote(personId, n.body) })}><Icon icon={IconDelete} size={16} /></Button>
          </div>
        </li>
      ))}</ul>
      {dialog}
    </div>
  );
}
