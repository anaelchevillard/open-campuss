"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { addNote, applyMarks, deleteNote, ensureSpace, listAnnotations, updateNote } from "@/app/actions/annotations";
import { Avatar } from "@/components/avatar";
import { annotationsNearLimit, MAX_ANNOTATIONS_PER_SPACE, anchorOf, HIGHLIGHT_COLORS, locate, planClear, planToggle, segments, type Anchor, type MarkKind, type MarkPlan, type Span } from "@/lib/annotate";
import type { AnnotationRow } from "@/lib/annotation-types";
import { useLive, type LivePeer } from "./live";
import { Icon } from "@/components/icon";
import { IconBold, IconClose, IconHighlight, IconImage, IconItalic, IconNote, IconStrike, IconUnderline } from "@/lib/icons";
import { cn } from "cn";
import { FRAME, useDocFrame } from "@/components/reading/doc-frame";
import { notesColumnWidth, notesInColumn } from "@/lib/reading-layout";
import { SelectionToolbar } from "@/components/reading/selection-toolbar";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useMedia } from "@/hooks/use-media";
import { RevisionPeople, SpaceChoice, type Sharing } from "./share-revision";
import { NOTES_COUNT, OPEN_NOTES } from "@/components/reading/events";

type Me = { id: string; name: string; avatarKey: string | null };
type Draft = { anchor: Anchor; general?: boolean };
type Located = AnnotationRow & Span;

const COLOR_LABELS: Record<string, string> = { yellow: "jaune", green: "vert", blue: "bleu", pink: "rose", orange: "orange" };
const SKIP = ".katex, script, style, .ann-overlay";
const DRAFT_ID = "draft";

const uuid = () => (crypto.randomUUID?.() ?? "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16)));
const timeOf = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

function textNodes(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (node) => (node.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  const out: { node: Text; start: number }[] = [];
  let length = 0;
  while (walker.nextNode()) { const node = walker.currentNode as Text; out.push({ node, start: length }); length += node.length; }
  return { nodes: out, length };
}

const fullText = (root: HTMLElement) => textNodes(root).nodes.map((n) => n.node.data).join("");

function unpaint(root: HTMLElement) {
  const parents = new Set<Node>();
  root.querySelectorAll("span.ann").forEach((el) => { parents.add(el.parentNode!); el.replaceWith(...el.childNodes); });
  parents.forEach((parent) => parent.normalize());
}

/** Enveloppe chaque tronçon annoté. Le texte du cours lui-même ne change pas : on retire tout et on repose à chaque modification. */
function paint(root: HTMLElement, rows: Located[], draft: Span | null) {
  unpaint(root);
  const spans = [...rows.map((r) => ({ id: r.id, start: r.start, end: r.end })), ...(draft ? [{ id: DRAFT_ID, ...draft }] : [])];
  if (!spans.length) return;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const { nodes } = textNodes(root);
  const pieces = segments(spans);
  for (let n = nodes.length - 1; n >= 0; n--) {
    const { node, start } = nodes[n];
    if (!node.data.trim()) continue;
    const end = start + node.length;
    for (const piece of pieces.filter((p) => p.start < end && start < p.end).reverse()) {
      const from = Math.max(piece.start, start) - start;
      const to = Math.min(piece.end, end) - start;
      if (to < node.length) node.splitText(to);
      const target = from > 0 ? node.splitText(from) : node;
      const span = document.createElement("span");
      const classes = new Set(["ann"]);
      const notes: string[] = [];
      for (const id of piece.ids) {
        if (id === DRAFT_ID) { classes.add("ann-draft"); continue; }
        const row = byId.get(id)!;
        if (row.kind === "note") { notes.push(id); classes.add("ann-note"); }
        else classes.add(row.kind === "hl" ? `ann-hl-${row.color}` : `ann-${row.kind}`);
      }
      span.className = [...classes].join(" ");
      if (notes.length) span.dataset.notes = notes.join(" ");
      target.replaceWith(span);
      span.append(target);
    }
  }
}

/** Convertit une sélection du navigateur en positions dans le texte, en laissant les espaces hors du passage. */
function rangeToSpan(root: HTMLElement, range: Range): Span | null {
  const { nodes } = textNodes(root);
  let start = -1;
  let end = -1;
  for (const { node, start: at } of nodes) {
    if (!range.intersectsNode(node)) continue;
    const from = node === range.startContainer ? range.startOffset : 0;
    const to = node === range.endContainer ? range.endOffset : node.length;
    if (to <= from) continue;
    if (start < 0) start = at + from;
    end = at + to;
  }
  if (start < 0 || end <= start) return null;
  const text = nodes.map((n) => n.node.data).join("");
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return end > start ? { start, end } : null;
}

function spanToRange(root: HTMLElement, span: Span) {
  const { nodes } = textNodes(root);
  const locateIn = (offset: number, preferEnd: boolean) => {
    const entry = nodes.find((n) => (preferEnd ? offset <= n.start + n.node.length : offset < n.start + n.node.length));
    return entry ? { node: entry.node, offset: offset - entry.start } : null;
  };
  const from = locateIn(span.start, false);
  const to = locateIn(span.end, true);
  if (!from || !to) return null;
  const range = new Range();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  return range;
}

function Composer({ placeholder, autoFocus, initial = "", onSave, onCancel, onPhoto, busy }: { placeholder: string; autoFocus?: boolean; initial?: string; onSave: (text: string) => void; onCancel: () => void; onPhoto?: (file: File) => void; busy?: boolean }) {
  const [value, setValue] = useState(initial);
  const area = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  useEffect(() => { if (autoFocus) area.current?.focus(); }, [autoFocus]);
  const done = () => { const text = value.trim(); if (text) onSave(text); else onCancel(); };
  return (
    <div className="flex items-end gap-1">
      <textarea ref={area} rows={1} value={value} aria-label={placeholder} placeholder={placeholder} maxLength={4000} disabled={busy}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.stopPropagation(); onCancel(); }
          if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); done(); }
        }}
        onBlur={done}
        className="min-h-7 w-full resize-none bg-transparent py-0.5 text-sm leading-snug outline-none placeholder:text-muted-foreground" />
      {onPhoto && (
        <label title="Joindre une photo" className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted" onMouseDown={(event) => event.preventDefault()}>
          <Icon icon={IconImage} className="size-4" />
          <input type="file" accept="image/*" aria-label="Joindre une photo à la note" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) onPhoto(file); event.target.value = ""; }} />
        </label>
      )}
    </div>
  );
}

/** Une note. `margin` : posée dans la marge, toujours visible, avec Modifier et Supprimer à portée sans l'ouvrir. */
function NoteCard({ note, replies, me, owner, shared, active, orphan, margin = false, onActivate, onReply, onUpdate, onDelete }: {
  note: AnnotationRow; replies: AnnotationRow[]; me: Me; owner: boolean; shared: boolean; active: boolean; orphan: boolean; margin?: boolean;
  onActivate: () => void; onReply: (text: string) => void; onUpdate: (id: string, text: string) => void; onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const line = (row: AnnotationRow) => (
    <div key={row.id} className="grid gap-1">
      {shared && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Avatar user={{ id: row.authorId, name: row.authorName, avatarKey: row.authorAvatar }} size={18} /><span className="font-semibold text-foreground">{row.authorId === me.id ? "Toi" : row.authorName}</span>{timeOf(row.createdAt)}</p>}
      {editing === row.id
        ? <Composer autoFocus initial={row.note ?? ""} placeholder="Modifier la note" onSave={(text) => { setEditing(null); onUpdate(row.id, text); }} onCancel={() => setEditing(null)} />
        : row.note && <p className={cn("whitespace-pre-line text-sm leading-snug wrap-break-word", margin && !active && "line-clamp-6")}>{row.note}</p>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {row.photo && <img src={row.photo} alt="" loading="lazy" className="mt-1 max-h-48 rounded-md object-cover" />}
      {(active || margin) && editing !== row.id && (row.authorId === me.id || owner) && (
        <p className="flex gap-3 text-xs text-muted-foreground">
          {row.authorId === me.id && row.note !== null && <button type="button" className="hover:text-foreground" onClick={(event) => { event.stopPropagation(); setEditing(row.id); }}>Modifier</button>}
          <button type="button" className="hover:text-foreground" onClick={(event) => { event.stopPropagation(); onDelete(row.id); }}>Supprimer</button>
        </p>
      )}
    </div>
  );
  return (
    <article data-note={note.id} onClick={onActivate} className={`cursor-pointer rounded-lg bg-card p-2.5 transition-shadow duration-150 ${active ? "shadow-md ring-1 ring-primary/40" : "shadow-xs ring-1 ring-border hover:shadow-sm"}`}>
      {orphan && <p className="mb-1 text-xs text-muted-foreground">Le passage a changé : « {note.quote.slice(0, 60)}{note.quote.length > 60 ? "…" : ""} »</p>}
      {!note.quote && <p className="mb-1 text-xs text-muted-foreground">Sur tout le cours</p>}
      {line(note)}
      {replies.length > 0 && <div className="mt-2 grid gap-2 border-t pt-2">{replies.map(line)}</div>}
      {active && shared && <div className="mt-2 border-t pt-1.5" onClick={(event) => event.stopPropagation()}><Composer placeholder="Répondre…" onSave={onReply} onCancel={() => undefined} /></div>}
    </article>
  );
}

/** La couche de révision : elle se pose sur le cours affiché, sans jamais en changer le texte. */
export function AnnotationLayer({ docId, initialSpace, initialRows, me, owner, shared, sharing, children }: { docId: string; initialSpace: string | null; initialRows: AnnotationRow[]; me: Me; owner: boolean; shared: boolean; sharing?: Sharing; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const frame = useDocFrame();
  const [rows, setRows] = useState(initialRows);
  const [space, setSpace] = useState(initialSpace);
  const [text, setText] = useState("");
  const [selection, setSelection] = useState<{ span: Span; rect: DOMRect } | null>(null);
  const coarse = frame.coarse;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const [error, setError] = useState("");
  const [tops, setTops] = useState<Record<string, number>>({});
  const [dots, setDots] = useState<{ id: string; top: number; count: number }[]>([]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  const pointerDown = useRef(false);
  const selectionRef = useRef(selection);
  useLayoutEffect(() => { selectionRef.current = selection; }, [selection]);
  // Ordinateur et tablette : les notes dans la marge, toujours visibles ; téléphone : pastilles et feuille basse
  const wide = notesInColumn(frame.width);
  const gap = frame.width >= 79 ? "2.5rem" : frame.width >= FRAME.narrow ? "1.5rem" : "0.75rem";

  const refresh = useCallback(async () => {
    if (!space || pending.current) return;
    const fresh = await listAnnotations(space).catch(() => null);
    if (fresh) setRows(fresh);
  }, [space]);
  const live = useLive(shared ? space : null, me, refresh);

  useEffect(() => { if (host.current) setText(fullText(host.current)); }, []);

  // Le panneau Notes s'ouvre depuis la barre d'actions, la barre de lecture ou le menu Réviser
  useEffect(() => {
    const open = () => setPanel(true);
    addEventListener(OPEN_NOTES, open);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- l'adresse ne se lit qu'au navigateur
    if (new URLSearchParams(location.search).get("notes") === "1") setPanel(true);
    return () => removeEventListener(OPEN_NOTES, open);
  }, []);

  const located = useMemo(() => {
    const out: Located[] = [];
    if (!text) return out;
    for (const row of rows) {
      if (row.parentId) continue;
      const span = locate(text, row);
      if (span) out.push({ ...row, ...span });
    }
    return out;
  }, [rows, text]);
  const marks = useMemo(() => located.filter((r) => r.kind !== "note"), [located]);
  const notes = useMemo(() => rows.filter((r) => r.kind === "note" && !r.parentId), [rows]);
  const repliesOf = useCallback((id: string) => rows.filter((r) => r.parentId === id), [rows]);
  const anchored = useMemo(() => located.filter((r) => r.kind === "note"), [located]);
  const loose = useMemo(() => notes.filter((n) => !anchored.some((a) => a.id === n.id)), [notes, anchored]);
  const activeNote = notes.find((n) => n.id === active);
  const printed = useMemo(() => [...anchored].sort((a, b) => a.start - b.start), [anchored]);

  // La grille sait combien de notes existent : le sommaire passe en rail, le texte ne bouge pas
  const { setNotes } = frame;
  useEffect(() => { setNotes(notes.length + (draft && wide ? 1 : 0)); }, [notes.length, draft, wide, setNotes]);
  useEffect(() => { dispatchEvent(new CustomEvent(NOTES_COUNT, { detail: notes.length })); }, [notes.length]);

  // Repose les marques, puis redonne sa sélection au lecteur : découper le texte la ferait disparaître
  useLayoutEffect(() => {
    const el = host.current;
    if (!el || !text) return;
    paint(el, located, draft && draft.anchor.quote ? locate(text, draft.anchor) : null);
    const span = selectionRef.current?.span;
    if (span) {
      const range = spanToRange(el, span);
      if (range) { const browser = getSelection(); browser?.removeAllRanges(); browser?.addRange(range); }
    }
    if (active) el.querySelectorAll(`[data-notes~="${active}"]`).forEach((n) => n.classList.add("ann-active"));
    // Numéros des notes pour l'impression : posés sur le dernier morceau de chaque passage
    const order = new Map(printed.map((note, index) => [note.id, index + 1]));
    const lastOf = new Map<number, HTMLElement>();
    el.querySelectorAll<HTMLElement>("[data-notes]").forEach((span) => { for (const id of span.dataset.notes!.split(" ")) { const n = order.get(id); if (n) lastOf.set(n, span); } });
    lastOf.forEach((span, n) => { span.dataset.n = [span.dataset.n, n].filter(Boolean).join(","); });
  }, [located, text, draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const readSelection = useCallback(() => {
    const el = host.current;
    const browser = getSelection();
    if (!el || !browser || browser.isCollapsed || !browser.rangeCount) { setSelection(null); live.setCursor(null); return; }
    const range = browser.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) { setSelection(null); live.setCursor(null); return; }
    const span = rangeToSpan(el, range);
    if (!span) { setSelection(null); return; }
    setSelection({ span, rect: range.getBoundingClientRect() });
    live.setCursor(span);
  }, [live]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onChange = () => { clearTimeout(timer); timer = setTimeout(() => { if (!pointerDown.current) readSelection(); }, 80); };
    // À la souris, le menu attend la fin du geste. Au doigt, le navigateur garde le geste pour lui et n'envoie jamais de relâchement
    const down = (event: PointerEvent) => { if (event.pointerType === "mouse" && !(event.target as Element).closest?.("[data-selection-menu]")) pointerDown.current = true; };
    const up = () => { if (pointerDown.current) { pointerDown.current = false; onChange(); } };
    const onScroll = () => {
      if (!selectionRef.current) return;
      const browser = getSelection();
      if (browser?.rangeCount) setSelection((s) => (s ? { ...s, rect: browser.getRangeAt(0).getBoundingClientRect() } : s));
    };
    document.addEventListener("selectionchange", onChange);
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    addEventListener("scroll", onScroll, { passive: true });
    return () => { clearTimeout(timer); document.removeEventListener("selectionchange", onChange); document.removeEventListener("pointerdown", down); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up); removeEventListener("scroll", onScroll); };
  }, [readSelection]);

  const run = useCallback((work: () => Promise<{ error?: string; spaceId?: string; rows?: AnnotationRow[] } | AnnotationRow[]>) => {
    pending.current++;
    queue.current = queue.current.then(work).then((result) => {
      pending.current--;
      const fresh = Array.isArray(result) ? result : result.rows;
      if (!Array.isArray(result) && result.spaceId) setSpace(result.spaceId);
      if (!Array.isArray(result) && result.error) setError(result.error); else setError("");
      if (fresh && !pending.current) setRows(fresh);
      live.signal();
    }).catch(() => { pending.current--; setError("Ton annotation n’a pas pu être enregistrée. Vérifie ta connexion."); });
  }, [live]);

  const commit = useCallback((plan: MarkPlan) => {
    const add = plan.add.map((m) => ({ id: uuid(), kind: m.kind, color: m.color, ...anchorOf(text, m.span.start, m.span.end) }));
    setRows((all) => [...all.filter((r) => !plan.remove.includes(r.id)), ...add.map((m) => ({ ...m, note: null, photo: null, parentId: null, authorId: me.id, authorName: me.name, authorAvatar: me.avatarKey, createdAt: new Date().toISOString() }))]);
    const spaceNow = space;
    run(() => applyMarks(docId, spaceNow, { remove: plan.remove, add }));
  }, [text, space, docId, me, run]);

  const startNote = () => {
    if (!selection) return;
    setDraft({ anchor: anchorOf(text, selection.span.start, selection.span.end) });
    setSelection(null);
    setActive(null);
    getSelection()?.removeAllRanges();
  };
  const startGeneral = () => { setActive(null); setPanel(false); setDraft({ anchor: { start: -1, end: -1, quote: "", prefix: "", suffix: "" }, general: true }); };

  const saveDraft = (value: string) => {
    if (!draft) return;
    const anchor = draft.anchor;
    setDraft(null);
    run(() => addNote(docId, space, anchor, value, null, null));
  };

  const addPhoto = async (file: File) => {
    if (!draft) return;
    const anchor = draft.anchor;
    setError("");
    try {
      const spaceId = await ensureSpace(docId, space);
      setSpace(spaceId);
      const response = await fetch(`/api/revision/images?space=${spaceId}`, { method: "POST", body: file });
      const data = await response.json().catch(() => ({})) as { id?: string; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error ?? "La photo n’a pas pu être envoyée.");
      setDraft(null);
      run(() => addNote(docId, spaceId, anchor, "", null, data.id!));
    } catch (failure) {
      setError((failure as Error).message);
    }
  };

  const activate = useCallback((id: string, fromText = false) => {
    setActive(id);
    const el = host.current;
    if (!el) return;
    el.querySelectorAll(".ann-active, .ann-glow").forEach((n) => n.classList.remove("ann-active", "ann-glow"));
    const targets = [...el.querySelectorAll<HTMLElement>(`[data-notes~="${id}"]`)];
    // Relancer l'animation même si le lecteur reclique sur la même note
    void el.offsetWidth;
    targets.forEach((n) => n.classList.add("ann-active", "ann-glow"));
    if (fromText || !targets.length) return;
    const box = targets[0].getBoundingClientRect();
    if (box.top < 120 || box.bottom > innerHeight - 80) targets[0].scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const deactivate = useCallback(() => {
    setActive(null);
    host.current?.querySelectorAll(".ann-active, .ann-glow").forEach((n) => n.classList.remove("ann-active", "ann-glow"));
  }, []);

  // Un clic sur un passage annoté ouvre sa note ; un clic ailleurs referme
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element;
      if (target.closest?.("[data-note], [data-selection-menu], [data-note-dot], [role=dialog]")) return;
      const noted = target.closest?.<HTMLElement>("[data-notes]");
      if (noted && !getSelection()?.toString()) { activate(noted.dataset.notes!.split(" ")[0], true); return; }
      deactivate();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [activate, deactivate]);

  // Chaque note face à son passage ; celle qu'on lit garde sa place, les autres s'écartent
  const placeNotes = useCallback(() => {
    const top = root.current;
    const el = host.current;
    if (!top || !el) return;
    const base = top.getBoundingClientRect().top;
    const want = (id: string) => { const anchor = el.querySelector(id === DRAFT_ID ? ".ann-draft" : `[data-notes~="${id}"]`); return anchor ? anchor.getBoundingClientRect().top - base : -1; };
    if (!wide) {
      // Pastilles : les notes d'une même ligne se regroupent
      const next: { id: string; top: number; count: number }[] = [];
      for (const note of anchored.map((n) => ({ id: n.id, top: want(n.id) })).filter((n) => n.top >= 0).sort((a, b) => a.top - b.top)) {
        const last = next[next.length - 1];
        if (last && note.top - last.top < 24) last.count++;
        else next.push({ ...note, count: 1 });
      }
      setDots((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
      return;
    }
    const side = rail.current;
    if (!side) return;
    const items = [...side.querySelectorAll<HTMLElement>("[data-slot]")].map((item) => ({ id: item.dataset.slot!, height: item.offsetHeight, want: want(item.dataset.slot!) }))
      .filter((i) => i.want >= 0).sort((a, b) => a.want - b.want);
    const space = 8;
    const pivot = items.findIndex((i) => i.id === active);
    const next: Record<string, number> = {};
    const floor = loose.length ? (side.querySelector<HTMLElement>("[data-loose]")?.offsetHeight ?? 0) + space : 0;
    if (pivot >= 0) {
      next[items[pivot].id] = Math.max(floor, items[pivot].want);
      for (let i = pivot + 1, y = next[items[pivot].id] + items[pivot].height + space; i < items.length; i++) { next[items[i].id] = Math.max(y, items[i].want); y = next[items[i].id] + items[i].height + space; }
      for (let i = pivot - 1, y = next[items[pivot].id] - space; i >= 0; i--) { next[items[i].id] = Math.min(items[i].want, y - items[i].height); y = next[items[i].id] - space; }
    } else {
      let y = floor;
      for (const item of items) { next[item.id] = Math.max(y, item.want); y = next[item.id] + item.height + space; }
    }
    setTops((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
  }, [active, loose.length, wide, anchored]);

  // Les notes se placent d'après des mesures du DOM : rien à calculer pendant le rendu
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useLayoutEffect(() => { placeNotes(); }, [placeNotes, rows, draft, located]);
  useEffect(() => {
    const top = root.current;
    if (!top) return;
    const observer = new ResizeObserver(() => placeNotes());
    observer.observe(top);
    if (rail.current) observer.observe(rail.current);
    return () => observer.disconnect();
  }, [placeNotes]);

  const activeKinds = useMemo(() => {
    const set = new Set<string>();
    if (!selection) return set;
    for (const mark of marks) if (mark.start < selection.span.end && selection.span.start < mark.end) set.add(mark.kind === "hl" ? `hl-${mark.color}` : mark.kind);
    return set;
  }, [selection, marks]);

  const card = (note: AnnotationRow, orphan = false, quiet = false, margin = false) => (
    <NoteCard key={note.id} note={note} replies={repliesOf(note.id)} me={me} owner={owner} shared={shared} active={!quiet && active === note.id} orphan={orphan} margin={margin}
      onActivate={() => activate(note.id)}
      onReply={(value) => run(() => addNote(docId, space, { start: -1, end: -1, quote: "", prefix: "", suffix: "" }, value, note.id, null))}
      onUpdate={(id, value) => run(() => updateNote(id, value))}
      onDelete={(id) => { if (active === id) setActive(null); run(() => deleteNote(id)); }} />
  );
  const draftCard = draft && (
    <article data-note="draft" className="rounded-lg bg-card p-2.5 shadow-md ring-1 ring-primary/40">
      <Composer autoFocus placeholder="Écris ta note…" onSave={saveDraft} onCancel={() => setDraft(null)} onPhoto={(file) => void addPhoto(file)} />
    </article>
  );

  const selectionGroups = selection ? [
    HIGHLIGHT_COLORS.map((color, index) => ({ key: `hl-${color}`, label: `Surligner en ${COLOR_LABELS[color]}`, ...(index === 0 ? { icon: IconHighlight } : { swatch: `hl-${color}` }), pressed: activeKinds.has(`hl-${color}`), onClick: () => commit(planToggle(marks, "hl", color, selection.span)) })),
    ([["bold", "Gras", IconBold], ["italic", "Italique", IconItalic], ["underline", "Souligner", IconUnderline], ["strike", "Barrer", IconStrike]] as const)
      // eslint-disable-next-line react-hooks/refs -- faux positif : `commit` ne lit ses refs qu'au clic
      .map(([kind, label, icon]) => ({ key: kind, label, icon, pressed: activeKinds.has(kind), onClick: () => commit(planToggle(marks, kind as MarkKind, null, selection.span)) })),
    [{ key: "note", label: "Note", icon: IconNote, text: "Note", onClick: startNote }],
    activeKinds.size ? [{ key: "clear", label: "Effacer", icon: IconClose, onClick: () => commit(planClear(marks, selection.span)) }] : [],
  ] : [];
  const menuWidth = 360;
  const menuStyle: CSSProperties | undefined = selection && !coarse ? {
    position: "fixed",
    left: Math.max(12, Math.min(selection.rect.left + selection.rect.width / 2 - menuWidth / 2, innerWidth - menuWidth - 12)),
    top: Math.max(64, Math.min(selection.rect.top < 120 ? selection.rect.bottom + 8 : selection.rect.top - 48, innerHeight - 56)),
  } : undefined;

  return (
    <div ref={root} className="ann-root relative">
      <div ref={host} className="ann-host">{children}</div>
      <LiveCursors host={host} peers={live.peers} />
      {/* La grille isole ses descendants (requête de conteneur) : ce qui se place par rapport à l'écran vit dans body */}
      {selection && createPortal(
        <SelectionToolbar label="Annoter le passage" coarse={coarse} groups={selectionGroups} style={menuStyle}
          className={coarse ? "fixed inset-x-3 bottom-[calc(var(--bottom-offset)+0.5rem)] z-(--z-overlay) justify-between pb-safe" : "z-(--z-overlay)"} />,
        document.body)}
      {error && createPortal(<p role="alert" className="fixed inset-x-4 bottom-[calc(var(--bottom-offset)+1rem)] z-(--z-toast) mx-auto w-fit rounded-lg bg-destructive px-3 py-2 text-sm text-white shadow-lg">{error}</p>, document.body)}
      {wide && (notes.length > 0 || draft) && (
        <div ref={rail} aria-label="Notes" role="region" className="ann-rail absolute top-0" style={{ left: `calc(100% + ${gap})`, width: `${notesColumnWidth(frame.width)}rem` }}>
          {(loose.length > 0 || (draft && !draft.anchor.quote)) && <div data-loose className="grid gap-2">{draft && !draft.anchor.quote && draftCard}{loose.map((note) => card(note, Boolean(note.quote), false, true))}</div>}
          {[...anchored, ...(draft?.anchor.quote ? [{ id: DRAFT_ID } as Located] : [])].map((note) => (
            <div key={note.id} data-slot={note.id} className="absolute inset-x-0 top-0 transition-[translate,opacity] duration-(--dur-fast) ease-out" style={{ translate: `0 ${tops[note.id] ?? 0}px`, opacity: tops[note.id] === undefined ? 0 : 1 }}>
              {note.id === DRAFT_ID ? draftCard : card(note, false, false, true)}
            </div>
          ))}
        </div>
      )}
      {!wide && dots.map((dot) => (
        <NoteDot key={dot.id} top={dot.top} left={`calc(100% + ${gap})`} count={dot.count} open={active === dot.id}
          onOpen={() => activate(dot.id)} onClose={deactivate}>
          {notes.find((n) => n.id === dot.id) && card(notes.find((n) => n.id === dot.id)!)}
        </NoteDot>
      ))}
      {!wide && (
        <ResponsiveSheet open={Boolean(draft)} onOpenChange={(open) => { if (!open) setDraft(null); }} title={draft?.anchor.quote ? `« ${draft.anchor.quote.slice(0, 60)}${draft.anchor.quote.length > 60 ? "…" : ""} »` : "Note sur tout le cours"} size="sm">
          {draftCard}
        </ResponsiveSheet>
      )}
      {!wide && activeNote && !dots.some((d) => d.id === activeNote.id) && (
        <ResponsiveSheet open onOpenChange={(open) => { if (!open) deactivate(); }} title="Note" hideTitle size="sm">{card(activeNote)}</ResponsiveSheet>
      )}
      {annotationsNearLimit(rows.length) && <p role="status" className="mt-6 text-sm text-muted-foreground">Ce cours approche de la limite de {MAX_ANNOTATIONS_PER_SPACE.toLocaleString("fr-FR")} annotations ({rows.length.toLocaleString("fr-FR")}). Retire celles dont tu n’as plus besoin.</p>}
      {printed.length > 0 && (
        <ol aria-hidden="true" className="print-notes-list hidden">
          {printed.map((note, index) => <li key={note.id}><strong>{index + 1}.</strong> « {note.quote.slice(0, 120)} » {note.note}</li>)}
        </ol>
      )}
      <NotesPanel open={panel} onOpenChange={setPanel} notes={notes} marks={marks} card={(note) => card(note, Boolean(note.quote) && !anchored.some((a) => a.id === note.id), true)}
        index={wide}
        onPick={(id) => {
          // Les notes sont déjà dans la marge : le panneau mène à elles (le panneau rangé à côté reste ouvert sur grand écran)
          if (!wide || !matchMedia("(min-width: 1280px)").matches) setPanel(false);
          setTimeout(() => {
            if (anchored.some((a) => a.id === id)) activate(id);
            else rail.current?.querySelector(`[data-note="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 220);
        }}
        onPickMark={(mark) => { setPanel(false); setTimeout(() => { const range = host.current && spanToRange(host.current, mark); range?.startContainer.parentElement?.scrollIntoView({ behavior: "smooth", block: "center" }); }, 220); }}
        onGeneral={startGeneral} sharing={sharing} hasMarks={rows.length > 0} />
    </div>
  );
}

/**
 * Pastille dans la gouttière du téléphone (pas de marge) : une note face à son passage, qui s'ouvre en feuille basse.
 * Plus jamais de bulle par-dessus le texte.
 */
function NoteDot({ top, left, count, open, onOpen, onClose, children }: { top: number; left: string; count: number; open: boolean; onOpen: () => void; onClose: () => void; children: ReactNode }) {
  const dot = (
    <button type="button" data-note-dot aria-label={count > 1 ? `${count} notes` : "Voir la note"} onClick={onOpen}
      className="absolute flex items-center justify-center after:absolute after:-inset-2 coarse:after:-inset-3" style={{ top, left }}>
      <span className={cn("flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[0.6875rem] font-semibold tabular-nums transition-colors", open ? "bg-primary text-primary-foreground" : "bg-brand-tint text-brand-text")}>
        {count > 1 ? count : <Icon icon={IconNote} size={16} className="size-3" />}
      </span>
    </button>
  );
  return (
    <>
      {dot}
      <ResponsiveSheet open={open} onOpenChange={(next) => { if (!next) onClose(); }} title="Note" hideTitle size="sm">{children}</ResponsiveSheet>
    </>
  );
}

/** Panneau Notes : notes, surlignages, espace de révision et amis, note sur tout le cours. */
function NotesPanel({ open, onOpenChange, notes, marks, card, index, onPick, onPickMark, onGeneral, sharing, hasMarks }: {
  open: boolean; onOpenChange: (open: boolean) => void; notes: AnnotationRow[]; marks: Located[]; card: (note: AnnotationRow) => ReactNode;
  /** Les notes sont déjà dans la marge : le panneau en donne le sommaire (passage, début de la note) au lieu de les répéter */
  index: boolean;
  onPick: (id: string) => void; onPickMark: (mark: Located) => void; onGeneral: () => void; sharing?: Sharing; hasMarks: boolean;
}) {
  const side = useMedia("(min-width: 768px)");
  // Grand écran : le panneau se range à côté du cours (pas de voile ni de flou) et le cours se décale vers la gauche
  const docked = useMedia("(min-width: 1280px)");
  const [tab, setTab] = useState<"notes" | "marks">("notes");
  useBackToClose(open && side, () => onOpenChange(false));
  useEffect(() => {
    if (!open || !docked) return;
    const root = document.documentElement;
    root.dataset.notesDocked = "";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) onOpenChange(false); };
    addEventListener("keydown", onKey);
    return () => { delete root.dataset.notesDocked; removeEventListener("keydown", onKey); };
  }, [open, docked, onOpenChange]);
  const highlights = marks.filter((m) => m.kind === "hl").sort((a, b) => a.start - b.start);
  const body = (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <SegmentedTabs label="Contenu du panneau" value={tab} onValueChange={(v) => setTab(v as "notes" | "marks")}
          items={[{ value: "notes", label: "Notes", count: notes.length }, { value: "marks", label: "Mes surlignages", count: highlights.length }]} />
        {tab === "notes" ? (
          !notes.length
            ? <p className="text-sm text-muted-foreground">Sélectionne un passage puis « Note »</p>
            : index
              ? <ul className="grid gap-1">{notes.map((note) => (
                <li key={note.id}><button type="button" onClick={() => onPick(note.id)} className="grid w-full gap-0.5 rounded-lg px-2 py-1.5 text-left hover-ok:bg-muted">
                  <span className="truncate text-xs text-muted-foreground">{note.quote ? `« ${note.quote} »` : "Sur tout le cours"}</span>
                  <span className="line-clamp-2 text-sm">{note.note || (note.photo ? "Photo" : "")}</span>
                </button></li>))}</ul>
              : <div className="grid gap-2">{notes.map((note) => <div key={note.id} onClick={() => note.quote && onPick(note.id)}>{card(note)}</div>)}</div>
        ) : (
          highlights.length
            ? <ul className="grid gap-1">{highlights.map((mark) => (
              <li key={mark.id}><button type="button" onClick={() => onPickMark(mark)} className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover-ok:bg-muted">
                <mark className={`ann-hl-${mark.color} line-clamp-2`}>{mark.quote}</mark></button></li>))}</ul>
            : <p className="text-sm text-muted-foreground">Aucun surlignage</p>
        )}
        <Button variant="outline" size="sm" className="justify-self-start" onClick={onGeneral}><Icon icon={IconNote} size={16} />Note sur tout le cours</Button>
      </div>
      {sharing && (
        <section aria-label="Réviser à plusieurs" className="grid gap-3 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">Réviser à plusieurs</h3>
          <SpaceChoice current={sharing.current} spaces={sharing.spaces} />
          <RevisionPeople sharing={sharing} hasMarks={hasMarks} />
        </section>
      )}
    </div>
  );
  if (!side) return <ResponsiveSheet open={open} onOpenChange={onOpenChange} title="Notes" size="md">{body}</ResponsiveSheet>;
  if (docked) {
    if (!open) return null;
    return (
      <aside role="dialog" aria-modal="false" aria-label="Notes" className="notes-dock fixed top-14 right-0 bottom-0 z-(--z-sticky) w-[24rem] overflow-y-auto border-l border-border bg-card px-4 pb-6 shadow-sm animate-[fade_var(--dur-base)_var(--ease-out)_both] print:hidden">
        <div className="sticky top-0 z-10 -mx-4 mb-2 flex items-center justify-between bg-card px-4 py-3">
          <h2 className="heading">Notes</h2>
          <Button variant="ghost" size="icon" aria-label="Fermer les notes" onClick={() => onOpenChange(false)}><Icon icon={IconClose} /></Button>
        </div>
        {body}
      </aside>
    );
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle>Notes</SheetTitle></SheetHeader>
        <div className="px-4 pb-6">{body}</div>
      </SheetContent>
    </Sheet>
  );
}


/** La sélection des autres personnes de la révision, peinte par-dessus le texte. */
function LiveCursors({ host, peers }: { host: React.RefObject<HTMLDivElement | null>; peers: LivePeer[] }) {
  const [boxes, setBoxes] = useState<{ id: string; name: string; color: string; rects: { left: number; top: number; width: number; height: number }[] }[]>([]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      const base = el.getBoundingClientRect();
      setBoxes(peers.filter((p) => p.cursor).map((peer) => {
        const range = spanToRange(el, peer.cursor!);
        const rects = range ? [...range.getClientRects()].filter((r) => r.width > 0).map((r) => ({ left: r.left - base.left, top: r.top - base.top, width: r.width, height: r.height })) : [];
        return { id: peer.id, name: peer.name, color: peer.color, rects };
      }));
    });
    return () => cancelAnimationFrame(frame);
  }, [peers, host]);
  return (
    <div aria-hidden="true" className="ann-overlay pointer-events-none absolute inset-0">
      {boxes.map((box) => box.rects.map((rect, index) => (
        <span key={`${box.id}-${index}`} className="live-cursor absolute rounded-[2px]" style={{ ...rect, background: `${box.color}33`, boxShadow: `inset 2px 0 0 ${box.color}` }}>
          {index === 0 && <span className="absolute -top-5 left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold text-white" style={{ background: box.color }}>{box.name}</span>}
        </span>
      )))}
    </div>
  );
}
