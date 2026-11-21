"use client";

import { useState } from "react";
import { findPeople, setCoauthor, transferAuthor } from "@/app/actions/admin/library";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconAdd, IconDelete, IconUser } from "@/lib/icons";

type Author = { id: string; name: string; role: "auteur" | "coauteur" };
type Person = { id: string; name: string; email: string };

/** Auteurs d'un document : remplacer l'auteur principal, ajouter ou retirer des co-auteurs (journalisé). */
export function DocumentAuthors({ documentId, authors }: { documentId: string; authors: Author[] }) {
  const { run, askReason, dialog, pending } = useAdminAction();
  const [picking, setPicking] = useState<"author" | "coauthor" | null>(null);
  const [keep, setKeep] = useState(true);
  const main = authors.find((a) => a.role === "auteur");

  const pick = async (person: Person) => {
    const mode = picking;
    setPicking(null);
    if (mode === "author") {
      const reason = await askReason({ title: `Faire de ${person.name} l’auteur`, confirmLabel: "Remplacer", level: "sensitive", description: "Les crédits suivent le nouvel auteur. Les deux personnes sont prévenues." });
      if (reason !== null) await run(() => transferAuthor([documentId], person.id, keep, reason), { success: "Auteur remplacé" });
    } else if (mode === "coauthor") {
      const reason = await askReason({ title: `Ajouter ${person.name} en co-auteur`, confirmLabel: "Ajouter", level: "sensitive" });
      if (reason !== null) await run(() => setCoauthor(documentId, person.id, true, reason), { success: "Co-auteur ajouté" });
    }
  };
  const remove = async (author: Author) => {
    const reason = await askReason({ title: `Retirer ${author.name} des co-auteurs`, confirmLabel: "Retirer", level: "sensitive", danger: true });
    if (reason !== null) await run(() => setCoauthor(documentId, author.id, false, reason), { success: "Co-auteur retiré" });
  };

  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold">Auteurs</h2>
      <ul className="line-list">
        {authors.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <Icon icon={IconUser} size={16} className="text-muted-foreground" />
            <span className="font-semibold">{a.name}</span>
            <span className="text-sm text-muted-foreground">{a.role === "auteur" ? "Auteur" : "Co-auteur"}</span>
            {a.role === "coauteur" && <Button className="ml-auto" size="sm" variant="destructive" pending={pending} onClick={() => void remove(a)}><Icon icon={IconDelete} size={16} />Retirer</Button>}
          </li>
        ))}
        {!authors.length && <li className="py-2.5 text-sm text-muted-foreground">Aucun auteur (compte supprimé)</li>}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={picking === "author" ? "secondary" : "outline"} aria-pressed={picking === "author"} onClick={() => setPicking(picking === "author" ? null : "author")}>{main ? "Remplacer l’auteur" : "Choisir un auteur"}</Button>
        <Button size="sm" variant={picking === "coauthor" ? "secondary" : "outline"} aria-pressed={picking === "coauthor"} onClick={() => setPicking(picking === "coauthor" ? null : "coauthor")}><Icon icon={IconAdd} size={16} />Ajouter un co-auteur</Button>
      </div>
      {picking && <PersonPicker key={picking} exclude={authors.map((a) => a.id)} onPick={(p) => void pick(p)}>
        {picking === "author" && main && <label className="flex items-center gap-2 text-sm"><Checkbox checked={keep} onCheckedChange={(v) => setKeep(Boolean(v))} />Garder {main.name} en co-auteur</label>}
      </PersonPicker>}
      {dialog}
    </section>
  );
}

function PersonPicker({ exclude, onPick, children }: { exclude: string[]; onPick: (person: Person) => void; children?: React.ReactNode }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Person[]>([]);
  const search = async (text: string) => { setQ(text); setFound(text.trim().length >= 2 ? (await findPeople(text)).filter((p) => !exclude.includes(p.id)) : []); };
  return (
    <div className="grid gap-2 rounded-xl bg-card p-3 shadow-xs">
      <Label htmlFor="doc-author-q">Personne</Label>
      <Input id="doc-author-q" value={q} onChange={(e) => void search(e.target.value)} placeholder="Nom ou adresse" autoComplete="off" autoFocus />
      {found.length > 0 && <ul className="grid gap-1">{found.map((p) => (
        <li key={p.id}><button type="button" className="flex min-h-11 w-full flex-col items-start rounded-lg px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => onPick(p)}>
          <span className="font-semibold">{p.name}</span><span className="text-muted-foreground">{p.email}</span></button></li>
      ))}</ul>}
      {children}
    </div>
  );
}
