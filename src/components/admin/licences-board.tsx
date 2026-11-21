"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { cn } from "cn";
import { addSubject, archiveSubject, createProgram, importSubjects, mergeSubjects, previewSubjectCsv, reorderSubjects, setProgramOpen, setTermDates, updateSubject } from "@/app/actions/admin/structure";
import { DateSelectorField } from "@/components/admin/date-field";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { ResponsiveMenu } from "@/components/responsive-menu";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Badge } from "@/components/reui/badge";
import { Sortable, SortableItem, SortableItemHandle } from "@/components/reui/sortable";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { SubjectCsvRow } from "@/lib/subject-csv";
import { IconAdd, IconArchive, IconTip, IconCollapse, IconDragHandle, IconExpand, IconLicences, IconMore, IconRestore, IconUpload, IconWarning } from "@/lib/icons";
import { inSentence } from "@/lib/subject-name";

// dnd-kit génère ses identifiants ARIA au rendu : il n'est monté qu'une fois dans le navigateur (sinon l'hydratation diffère)
const noop = () => () => undefined;
function useMounted() { return useSyncExternalStore(noop, () => true, () => false); }
type Loose = ComponentType<{ children?: ReactNode; className?: string; [prop: string]: unknown }>;
function Plain({ children, className }: { children?: ReactNode; className?: string }) { return <div className={className}>{children}</div>; }

type Subject = { id: number; name: string; shortName: string; semester: number | null; archived: boolean; docs: number; docsLabel: string; suggested: 1 | 2 | null };
type Program = { id: number; name: string; active: boolean };

/** Licences et matières : une année à la fois, colonnes S1 | S2 et Annuelles ; une matière change de colonne en un clic. */
export function LicencesBoard({ programs, programId, level, year, terms, subjects, conflicts }: {
  programs: Program[]; programId: number | null; level: number; year: string; terms: { s1: string; s2: string; custom: boolean } | null;
  subjects: Subject[]; conflicts: { id: string; title: string; semester: number | null; subject: string; subjectSemester: number | null }[];
}) {
  const router = useRouter();
  const { run, askReason, dialog } = useAdminAction();
  // Copie locale pour le glisser-déposer : remise à zéro quand le serveur renvoie une autre liste
  const [state, setState] = useState({ from: subjects, list: subjects });
  const list = state.from === subjects ? state.list : subjects;
  const setList = (next: Subject[] | ((l: Subject[]) => Subject[])) => setState((st) => {
    const base = st.from === subjects ? st.list : subjects;
    return { from: subjects, list: typeof next === "function" ? next(base) : next };
  });
  const [sheet, setSheet] = useState<null | "csv" | "program">(null);
  const mounted = useMounted();
  const program = programs.find((p) => p.id === programId);
  const odd = 2 * level - 1;
  const even = 2 * level;
  const live = list.filter((s) => !s.archived);
  const columns: [string, number | null, Subject[]][] = [[`S${odd}`, odd, live.filter((s) => s.semester === odd)], [`S${even}`, even, live.filter((s) => s.semester === even)], ["Annuelles", null, live.filter((s) => s.semester === null)]];
  const archived = list.filter((s) => s.archived);
  const href = (patch: Record<string, string | number>) => `/admin/licences?${new URLSearchParams({ licence: String(programId ?? ""), annee: String(level), ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, String(v)])) })}`;

  const move = (s: Subject, semester: number | null) => {
    const before = s.semester;
    setList((l) => l.map((x) => (x.id === s.id ? { ...x, semester } : x)));
    void run(() => updateSubject(s.id, { semester }), { success: `${s.name} → ${semester ? `S${semester}` : "annuelle"}`, undo: () => updateSubject(s.id, { semester: before }) });
  };
  const reorder = (column: Subject[], next: Subject[]) => {
    const ids = new Set(column.map((s) => s.id));
    const others = list.filter((s) => !ids.has(s.id));
    setList([...next, ...others]);
    void run(() => reorderSubjects(next.map((s) => s.id)), { quiet: true });
  };
  const step = (column: Subject[], index: number, delta: number) => {
    const next = [...column];
    const [item] = next.splice(index, 1);
    next.splice(Math.max(0, Math.min(next.length, index + delta)), 0, item);
    reorder(column, next);
  };
  const merge = async (s: Subject) => {
    const others = live.filter((o) => o.id !== s.id);
    let keep = String(others[0]?.id ?? "");
    const reason = await askReason({ title: `Fusionner « ${s.name} »`, confirmLabel: "Fusionner", level: "sensitive", description: "Ses cours, demandes et enseignants passent dans la matière gardée ; elle est archivée.",
      children: <Select items={others.map((o) => ({ value: String(o.id), label: o.name }))} defaultValue={keep} onValueChange={(v) => { keep = String(v); }}><SelectTrigger className="w-full" aria-label="Matière gardée"><SelectValue /></SelectTrigger><SelectContent>{others.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}</SelectContent></Select> });
    if (reason && keep) await run(() => mergeSubjects(Number(keep), s.id, reason), { success: "Matières fusionnées" });
  };

  if (!program) return <EmptyState icon={IconLicences} title="Aucune licence" action={<Button onClick={() => setSheet("program")}>Créer une licence</Button>} />;

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <Select items={programs.map((p) => ({ value: String(p.id), label: p.name }))} value={String(program.id)} onValueChange={(v) => router.push(`/admin/licences?licence=${v}&annee=${level}`)}>
          <SelectTrigger className="min-w-48" aria-label="Licence"><SelectValue /></SelectTrigger>
          <SelectContent>{programs.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm"><Switch checked={program.active} onCheckedChange={async (on) => {
          const reason = await askReason({ title: on ? `Ouvrir ${program.name} aux inscriptions` : `Fermer ${program.name} aux inscriptions`, confirmLabel: on ? "Ouvrir" : "Fermer", level: "sensitive" });
          if (reason) await run(() => setProgramOpen(program.id, on, reason), { success: on ? "Licence ouverte" : "Licence fermée" });
        }} />Ouverte aux inscriptions</label>
        <span className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setSheet("csv")}><Icon icon={IconUpload} size={16} />Importer</Button>
          <Button variant="ghost" size="sm" onClick={() => setSheet("program")}><Icon icon={IconAdd} size={16} />Licence</Button>
        </span>
      </div>
      <SegmentedTabs label="Année" value={String(level)} items={[1, 2, 3].map((l) => ({ value: String(l), label: `L${l}`, href: href({ annee: l }) }))} />
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {columns.map(([title, semester, column]) => (
          <section key={title} aria-label={title} className={cn("grid content-start gap-3 rounded-xl bg-muted/50 p-3", semester === null && "md:col-span-2 xl:col-span-1")}>
            <h2 className="heading flex items-center justify-between px-1">{title}<span className="text-sm font-normal tabular-nums text-muted-foreground">{column.length}</span></h2>
            {(() => {
              const Root = (mounted ? Sortable : Plain) as unknown as Loose;
              const Entry = (mounted ? SortableItem : Plain) as unknown as Loose;
              const Handle = (mounted ? SortableItemHandle : Plain) as unknown as Loose;
              return (
            <Root value={column} getItemValue={(s: Subject) => String(s.id)} onValueChange={(next: Subject[]) => reorder(column, next)} className="grid gap-2">
              {column.map((s, index) => (
                <Entry key={s.id} value={String(s.id)} className="rounded-lg bg-card shadow-xs">
                  <SubjectRow subject={s} odd={odd} even={even} onMove={(sem) => move(s, sem)}
                    handle={<Handle className="flex min-h-11 w-6 items-center justify-center text-muted-foreground fine:min-h-9"><Icon icon={IconDragHandle} size={16} label={`Déplacer ${s.name}`} /></Handle>}
                    menu={<ResponsiveMenu title={s.name} trigger={<Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${inSentence(s.name)}`}><Icon icon={IconMore} size={16} /></Button>} items={[
                      ...(index > 0 ? [{ label: "Monter", icon: IconCollapse, onSelect: () => step(column, index, -1) }] : []),
                      ...(index < column.length - 1 ? [{ label: "Descendre", icon: IconExpand, onSelect: () => step(column, index, 1) }] : []),
                      { label: "Fusionner avec…", icon: IconLicences, onSelect: () => void merge(s) },
                      { label: "Archiver", icon: IconArchive, separatorBefore: true, onSelect: () => void run(() => archiveSubject(s.id, true), { success: `${s.name} archivée`, undo: () => archiveSubject(s.id, false) }) },
                    ]} />}
                    onRename={(name) => updateSubject(s.id, { name }).then((r) => r.error)} onShort={(shortName) => updateSubject(s.id, { shortName }).then((r) => r.error)} />
                </Entry>
              ))}
            </Root>
              );
            })()}
            <AddSubject onAdd={(name) => run(() => addSubject(program.id, level, name, semester), { quiet: true }).then((r) => Boolean(r && !r.error))} />
          </section>
        ))}
      </div>
      {archived.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">Archivées · {archived.length}</summary>
          <ul className="mt-2 grid gap-1">{archived.map((s) => <li key={s.id} className="flex items-center gap-2 text-sm"><span className="flex-1 text-muted-foreground">{s.name}</span><Button variant="ghost" size="sm" onClick={() => void run(() => archiveSubject(s.id, false), { success: "Matière restaurée" })}><Icon icon={IconRestore} size={16} />Restaurer</Button></li>)}</ul>
        </details>
      )}
      {terms && <TermDates programId={program.id} year={year} terms={terms} onSave={(s1, s2) => run(() => setTermDates(program.id, year, s1, s2), { success: "Dates enregistrées" })} />}
      {conflicts.length > 0 && (
        <section className="grid gap-2">
          <h2 className="heading flex items-center gap-2"><Icon icon={IconWarning} className="text-warning-foreground" />Semestre en désaccord avec la matière</h2>
          <ul className="grid gap-1 text-sm">{conflicts.map((c) => <li key={c.id}><Link href={`/d/${c.id}`} className="text-link hover:underline">{c.title}</Link> <span className="text-muted-foreground">· S{c.semester} pour {inSentence(c.subject)} (S{c.subjectSemester})</span></li>)}</ul>
        </section>
      )}
      <CsvSheet open={sheet === "csv"} onClose={() => setSheet(null)} />
      <ProgramSheet open={sheet === "program"} onClose={() => setSheet(null)} onCreate={async (name) => { const r = await run(() => createProgram(name), { success: `${name} créée, fermée aux inscriptions` }); if (r?.data) { setSheet(null); router.push(`/admin/licences?licence=${r.data}`); } }} />
      {dialog}
    </div>
  );
}

function SubjectRow({ subject: s, odd, even, onMove, handle, menu, onRename, onShort }: {
  subject: Subject; odd: number; even: number; onMove: (semester: number | null) => void; handle: React.ReactNode; menu: React.ReactNode;
  onRename: (name: string) => Promise<string | undefined>; onShort: (short: string) => Promise<string | undefined>;
}) {
  const [name, setName] = useState(s.name);
  const [short, setShort] = useState(s.shortName);
  const current = s.semester === null ? "annual" : String(s.semester);
  const suggested = s.semester === null && s.suggested ? String(s.suggested === 1 ? odd : even) : null;
  return (
    <div className="grid gap-2 p-2">
      <div className="flex items-center gap-1">
        {handle}
        <input aria-label="Nom de la matière" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== s.name && void onRename(name)} className="min-h-9 min-w-0 flex-1 rounded-md bg-transparent px-1.5 text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" />
        {menu}
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-7">
        <ToggleGroup variant="outline" size="sm" spacing={0} value={[current]} onValueChange={(v) => { if (v[0] && v[0] !== current) onMove(v[0] === "annual" ? null : Number(v[0])); }} aria-label="Semestre">
          <ToggleGroupItem value={String(odd)}>S{odd}</ToggleGroupItem><ToggleGroupItem value={String(even)}>S{even}</ToggleGroupItem><ToggleGroupItem value="annual">Annuelle</ToggleGroupItem>
        </ToggleGroup>
        {suggested && <button type="button" onClick={() => onMove(Number(suggested))} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-brand-text hover:bg-brand-tint"><Icon icon={IconTip} size={16} />S{suggested} suggéré</button>}
        <input aria-label="Nom court" value={short} maxLength={20} onChange={(e) => setShort(e.target.value)} onBlur={() => short !== s.shortName && void onShort(short)} className="min-h-8 w-24 rounded-md bg-transparent px-1.5 text-xs text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" />
        <span className={cn("ml-auto text-xs tabular-nums", s.docs ? "text-muted-foreground" : "text-muted-foreground/70")}>{s.docsLabel}</span>
      </div>
    </div>
  );
}

function AddSubject({ onAdd }: { onAdd: (name: string) => Promise<boolean> }) {
  const [name, setName] = useState("");
  return (
    <form className="flex gap-1" onSubmit={async (e) => { e.preventDefault(); if (name.trim() && await onAdd(name)) setName(""); }}>
      <Input aria-label="Nouvelle matière" placeholder="Ajouter une matière" value={name} onChange={(e) => setName(e.target.value)} className="bg-card" />
      <Button type="submit" variant="ghost" size="icon" aria-label="Ajouter"><Icon icon={IconAdd} size={16} /></Button>
    </form>
  );
}

function TermDates({ year, terms, onSave }: { programId: number; year: string; terms: { s1: string; s2: string; custom: boolean }; onSave: (s1: string, s2: string) => Promise<unknown> }) {
  const [s1, setS1] = useState(terms.s1);
  const [s2, setS2] = useState(terms.s2);
  return (
    <section className="grid gap-3">
      <h2 className="heading">Dates des semestres · {year.replace("-", "–")}</h2>
      {!terms.custom && <p className="text-sm text-muted-foreground">Calendrier par défaut</p>}
      <div className="flex flex-wrap items-end gap-4">
        <DateSelectorField label="Début du S1" value={s1} onChange={(d) => { const v = d ?? ""; setS1(v); void onSave(v, s2); }} />
        <DateSelectorField label="Début du S2" value={s2} onChange={(d) => { const v = d ?? ""; setS2(v); void onSave(s1, v); }} />
      </div>
    </section>
  );
}

function CsvSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { run, askReason, dialog, pending } = useAdminAction();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<SubjectCsvRow[] | null>(null);
  const fresh = rows?.filter((r) => r.status === "new").length ?? 0;
  return (
    <ResponsiveSheet open={open} onOpenChange={(o) => { if (!o) { onClose(); setRows(null); } }} title="Importer des matières" size="lg"
      footer={rows ? <><Button variant="outline" onClick={() => setRows(null)}>Modifier</Button><Button pending={pending} disabled={!fresh} onClick={async () => {
        const reason = await askReason({ title: `Importer ${fresh} matière${fresh > 1 ? "s" : ""}`, confirmLabel: "Importer", level: "sensitive" });
        if (reason && !(await run(() => importSubjects(text, reason), { success: "Matières importées" }))?.error) { onClose(); setRows(null); setText(""); }
      }}>Importer {fresh}</Button></> : <Button pending={pending} onClick={async () => { const r = await run(() => previewSubjectCsv(text), { quiet: true }); if (r?.data) setRows(r.data); }}>Voir l’aperçu</Button>}>
      {rows ? (
        <div className="max-h-[50dvh] overflow-auto rounded-xl bg-card shadow-xs">
          <table className="w-full text-sm"><thead className="bg-muted text-left"><tr><th className="px-3 py-2 font-semibold">Matière</th><th className="px-3 py-2 font-semibold">Licence</th><th className="px-3 py-2 font-semibold">Semestre</th><th className="px-3 py-2 font-semibold">État</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.line} className={r.status === "invalid" ? "text-destructive-foreground" : r.status === "exists" ? "text-muted-foreground" : ""}><td className="px-3 py-1.5">{r.name || "—"}</td><td className="px-3 py-1.5">{r.program} L{r.level}</td><td className="px-3 py-1.5">{r.semester ? `S${r.semester}` : "Annuelle"}</td><td className="px-3 py-1.5">{r.status === "new" ? "Nouvelle" : r.status === "exists" ? "Déjà là" : r.problem}</td></tr>)}</tbody></table>
        </div>
      ) : (
        <div className="grid gap-1.5">
          <Label htmlFor="csv">Une matière par ligne</Label>
          <Textarea id="csv" rows={8} className="font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder={"Droit;L1;Droit civil;Civil;S1\nDroit;L1;Histoire du droit;Histoire;S2\nDroit;L1;Anglais;Anglais;annuelle"} />
          <p className="text-sm text-muted-foreground">licence;année;matière;nom court;semestre. Une licence inconnue est créée fermée.</p>
        </div>
      )}
      {dialog}
    </ResponsiveSheet>
  );
}

function ProgramSheet({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  return (
    <ResponsiveSheet open={open} onOpenChange={(o) => !o && onClose()} title="Nouvelle licence" footer={<Button onClick={() => void onCreate(name)}>Créer</Button>}>
      <div className="grid gap-1.5"><Label htmlFor="prog-name">Nom</Label><Input id="prog-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></div>
      <Badge variant="secondary" className="mt-2 w-fit">Fermée aux inscriptions jusqu’à ouverture</Badge>
    </ResponsiveSheet>
  );
}
