"use client";

import Link from "next/link";
import { useState } from "react";
import { emptyTrash, findPeople, moveToSubject, restoreDocs, setPublished, transferAuthor, trashDocs } from "@/app/actions/admin/library";
import { AdminGrid, type GridColumn } from "@/components/admin/admin-grid";
import { ago, shortDate } from "@/components/admin/badges";
import { BulkBar } from "@/components/admin/bulk-bar";
import { UrlFilters } from "@/components/admin/url-filters";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { ChapterPill, DocThumb, type DocCardDoc } from "@/components/doc-card";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { StatusBadge, type DocStatus } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { yearLabel } from "@/lib/doc-facets";
import { chapterLabel } from "@/lib/roman";
import { IconContent, IconDelete, IconHidden, IconPublished, IconRestore, IconSubjects, IconUser } from "@/lib/icons";

type Row = {
  id: string; title: string; author: string | null; program: string | null; subject: string | null; semester: number | null; categoryLabel: string; status: DocStatus; views: number; rating: number | null; updatedAt: Date; deletedAt: Date | null;
  category: DocCardDoc["category"]; chapter: number | null; academicYear: string; coverFileId: string | null; subjectId: number | null; subjectShort: string | null; level: number | null;
};

/** « L2 · S3 · 2025–2026 » : où se place le cours dans le cursus. */
const placeOf = (r: Row) => [r.level ? `L${r.level}` : "", r.semester ? `S${r.semester}` : "", r.academicYear ? yearLabel(r.academicYear) : ""].filter(Boolean).join(" · ");

export function ContentsView({ rows, total, page, pageSize, trash, programs, subjects, categories, now }: {
  rows: Row[]; total: number; page: number; pageSize: number; trash: boolean; programs: { id: number; name: string }[];
  subjects: { id: number; name: string; programId: number; level: number }[]; categories: { value: string; label: string }[]; now: number;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [sheet, setSheet] = useState<null | "subject" | "author">(null);
  const { run, askReason, dialog, pending } = useAdminAction();
  const done = (r: { error?: string } | null) => { if (r && !r.error) { setSelected([]); setSheet(null); } };

  const columns: GridColumn<Row>[] = [
    { id: "titre", header: "Titre", sortable: true, size: 340, cell: (r) => (
      <div className="flex items-center gap-3">
        <DocThumb doc={r} />
        <div className="grid min-w-0 gap-1">
          {chapterLabel(r.chapter) && <ChapterPill label={chapterLabel(r.chapter)} className="self-start bg-secondary text-secondary-foreground" />}
          <Link href={`/d/${r.id}`} onClick={(e) => e.stopPropagation()} className="line-clamp-2 font-semibold hover:underline">{r.title || "Sans titre"}</Link>
        </div>
      </div>
    ) },
    { id: "auteur", header: "Auteur", cell: (r) => r.author ?? <span className="text-muted-foreground">Ancien membre</span> },
    { id: "matiere", header: "Matière", size: 220, cell: (r) => (
      <div className="grid min-w-0 gap-0.5">
        <span className="line-clamp-2">{r.subject ?? <span className="text-muted-foreground">Sans matière</span>}</span>
        {placeOf(r) && <span className="text-sm text-muted-foreground tabular-nums">{placeOf(r)}</span>}
      </div>
    ) },
    { id: "type", header: "Type", hideBelow: "xl", cell: (r) => r.categoryLabel },
    { id: "etat", header: "État", cell: (r) => <StatusBadge status={trash ? "trash" : r.status} size="default" /> },
    { id: "notes", header: "Note", numeric: true, sortable: true, hideBelow: "xl", cell: (r) => (r.rating ? r.rating.toLocaleString("fr-FR") : "—") },
    { id: "vues", header: "Lecteurs", numeric: true, sortable: true, hideBelow: "lg", cell: (r) => r.views.toLocaleString("fr-FR") },
    { id: "maj", header: trash ? "Supprimé" : "Mis à jour", numeric: true, sortable: !trash, cell: (r) => <span className="text-muted-foreground">{ago(trash ? r.deletedAt : r.updatedAt, now)}</span> },
  ];

  const purge = async (ids: string[] | null) => {
    const reason = await askReason({ title: ids ? `Supprimer ${ids.length} cours définitivement` : "Vider la corbeille", confirmLabel: "Supprimer définitivement", level: "critical", expected: "vider", description: "Les fichiers sont effacés. Rien ne pourra être restauré." });
    if (reason) done(await run(() => emptyTrash(ids, reason), { success: "Supprimé définitivement" }));
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <UrlFilters placeholder="Titre ou auteur" fields={[
          ...(!trash ? [{ id: "etat", label: "État", options: [["draft", "Brouillon"], ["tofix", "À corriger"], ["pending", "En attente"], ["published", "Publié"], ["hidden", "Masqué"]].map(([value, label]) => ({ value, label })) }] : []),
          { id: "licence", label: "Licence", options: programs.map((p) => ({ value: String(p.id), label: p.name })) },
          { id: "matiere", label: "Matière", options: subjects.map((s) => ({ value: String(s.id), label: `L${s.level} · ${s.name}` })) },
          { id: "semestre", label: "Semestre", options: [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `S${n}` })) },
          { id: "type", label: "Type", options: categories },
          { id: "sans_matiere", label: "Sans matière", options: [{ value: "oui", label: "Sans matière" }] },
          { id: "signale", label: "Signalé", options: [{ value: "oui", label: "Signalement ouvert" }] },
          { id: "synchro", label: "Synchro", options: [{ value: "erreur", label: "En erreur" }] },
        ]} />
        {trash && total > 0 && <Button variant="destructive" onClick={() => void purge(null)}><Icon icon={IconDelete} size={16} />Vider la corbeille</Button>}
      </div>
      <AdminGrid label="Cours" rows={rows} columns={columns} total={total} page={page} pageSize={pageSize} selected={selected} onSelectedChange={setSelected}
        href={(r) => `/d/${r.id}`}
        mobileItem={(r) => ({
          media: <DocThumb doc={r} className="w-14" />,
          title: <>{chapterLabel(r.chapter) && <span className="mr-1.5 text-xs font-semibold tracking-wide text-muted-foreground tabular-nums">{chapterLabel(r.chapter)}</span>}{r.title || "Sans titre"}</>,
          meta: <>
            <span className="block">{[r.subject ?? "Sans matière", placeOf(r)].filter(Boolean).join(" · ")}</span>
            <span className="block">{r.author ?? "Ancien membre"} · {shortDate(r.updatedAt)}</span>
          </>,
          badge: <StatusBadge status={trash ? "trash" : r.status} size="sm" />,
        })}
        empty={<EmptyState icon={trash ? IconDelete : IconContent} title={trash ? "La corbeille est vide" : "Aucun cours ne correspond"} />} />
      {selected.length > 0 && (
        <BulkBar count={selected.length} onClear={() => setSelected([])}>
          {trash ? <>
            <Button size="sm" onClick={async () => done(await run(() => restoreDocs(selected), { success: "Restauré" }))}><Icon icon={IconRestore} size={16} />Restaurer</Button>
            <Button size="sm" variant="destructive" onClick={() => void purge(selected)}><Icon icon={IconDelete} size={16} />Supprimer</Button>
          </> : <>
            <Button size="sm" pending={pending} onClick={async () => { const ids = [...selected]; done(await run(() => setPublished(ids, true), { success: "Publié", undo: () => setPublished(ids, false) })); }}><Icon icon={IconPublished} size={16} />Publier</Button>
            <Button size="sm" variant="ghost" onClick={async () => { const ids = [...selected]; done(await run(() => setPublished(ids, false), { success: "Dépublié", undo: () => setPublished(ids, true) })); }}><Icon icon={IconHidden} size={16} />Dépublier</Button>
            <Button size="sm" variant="ghost" onClick={() => setSheet("subject")}><Icon icon={IconSubjects} size={16} />Matière</Button>
            <Button size="sm" variant="ghost" onClick={() => setSheet("author")}><Icon icon={IconUser} size={16} />Auteur</Button>
            <Button size="sm" variant="ghost" onClick={async () => { const ids = [...selected]; done(await run(() => trashDocs(ids), { success: "Mis à la corbeille", undo: () => restoreDocs(ids) })); }}><Icon icon={IconDelete} size={16} />Corbeille</Button>
          </>}
        </BulkBar>
      )}
      <SubjectSheet open={sheet === "subject"} onClose={() => setSheet(null)} subjects={subjects} onSubmit={async (id) => {
        const ids = [...selected];
        let before: Record<string, number | null> | undefined;
        const r = await run(async () => { const res = await moveToSubject(ids, id); before = res.data; return res; }, { success: "Matière changée", undo: () => moveToSubject(ids, null, before) });
        done(r);
      }} />
      <AuthorSheet open={sheet === "author"} onClose={() => setSheet(null)} count={selected.length} onSubmit={async (authorId, keep, reason) => done(await run(() => transferAuthor(selected, authorId, keep, reason), { success: "Auteur transféré" }))} />
      {dialog}
    </div>
  );
}

function SubjectSheet({ open, onClose, subjects, onSubmit }: { open: boolean; onClose: () => void; subjects: { id: number; name: string; level: number }[]; onSubmit: (id: number | null) => Promise<void> }) {
  const [value, setValue] = useState("");
  const items = [{ value: "", label: "Sans matière" }, ...subjects.map((s) => ({ value: String(s.id), label: `L${s.level} · ${s.name}` }))];
  return (
    <ResponsiveSheet open={open} onOpenChange={(o) => !o && onClose()} title="Changer de matière" footer={<Button onClick={() => void onSubmit(value ? Number(value) : null)}>Déplacer</Button>}>
      <Select items={items} value={value} onValueChange={(v) => setValue(String(v ?? ""))}><SelectTrigger className="w-full" aria-label="Matière"><SelectValue /></SelectTrigger><SelectContent>{items.map((i) => <SelectItem key={i.value || "none"} value={i.value}>{i.label}</SelectItem>)}</SelectContent></Select>
    </ResponsiveSheet>
  );
}

/** Transfert d'auteur : on cherche la personne par nom ou adresse ; l'ancien auteur peut rester co-auteur. */
function AuthorSheet({ open, onClose, count, onSubmit }: { open: boolean; onClose: () => void; count: number; onSubmit: (authorId: string, keep: boolean, reason: string) => Promise<void> }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; name: string; email: string }[]>([]);
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(null);
  const [keep, setKeep] = useState(true);
  const [reason, setReason] = useState("");
  const search = async (text: string) => { setQ(text); setChosen(null); setFound(text.trim().length >= 2 ? await findPeople(text) : []); };
  return (
    <ResponsiveSheet open={open} onOpenChange={(o) => !o && onClose()} title={`Transférer ${count} cours`} footer={<Button disabled={!chosen} onClick={() => chosen && void onSubmit(chosen.id, keep, reason)}>Transférer</Button>}>
      <div className="grid gap-4">
        <div className="grid gap-1.5"><Label htmlFor="author-q">Nouvel auteur</Label><Input id="author-q" value={chosen ? chosen.name : q} onChange={(e) => void search(e.target.value)} placeholder="Nom ou adresse" autoComplete="off" /></div>
        {!chosen && found.length > 0 && <ul className="grid gap-1">{found.map((p) => <li key={p.id}><button type="button" className="flex w-full min-h-11 flex-col items-start rounded-lg px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => setChosen(p)}><span className="font-semibold">{p.name}</span><span className="text-muted-foreground">{p.email}</span></button></li>)}</ul>}
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={keep} onCheckedChange={(v) => setKeep(Boolean(v))} />Garder l’ancien auteur en co-auteur</label>
        <div className="grid gap-1.5"><Label htmlFor="author-reason">Motif</Label><Input id="author-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></div>
        <p className="text-sm text-muted-foreground">Les crédits suivent le nouvel auteur. Les deux personnes sont prévenues.</p>
      </div>
    </ResponsiveSheet>
  );
}
