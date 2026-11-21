"use client";

import { useActionState, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { cn } from "cn";
import { createCard, updateCard } from "@/app/actions/study";
import type { FormState } from "@/components/action-form";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCoarsePointer } from "@/hooks/use-media";
import { applyFormat, insertAt, type Edit, type FormatKind } from "@/lib/card-format";
import { IconBold, IconBulletList, IconDone, IconError, IconFormula, IconImage, IconItalic, type IconData } from "@/lib/icons";
import { CardText } from "./card-text";

const FRONT_MAX = 1000;
const BACK_MAX = 2000;

type Side = "front" | "back";

const TOOLS: { kind: FormatKind; label: string; keys: string; icon: IconData }[] = [
  { kind: "bold", label: "Gras", keys: "Ctrl B", icon: IconBold },
  { kind: "italic", label: "Italique", keys: "Ctrl I", icon: IconItalic },
  { kind: "list", label: "Liste", keys: "Ctrl Maj L", icon: IconBulletList },
  { kind: "math", label: "Formule", keys: "Ctrl M", icon: IconFormula },
];

/** Raccourci de mise en forme d'un événement clavier, sinon null. */
function shortcutOf(event: KeyboardEvent): FormatKind | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "b" && !event.shiftKey) return "bold";
  if (key === "i" && !event.shiftKey) return "italic";
  if (key === "l" && event.shiftKey) return "list";
  if (key === "m") return event.shiftKey ? "mathBlock" : "math";
  return null;
}

async function uploadCardImage(file: File): Promise<{ url: string } | { error: string }> {
  const response = await fetch("/api/cards/images", { method: "POST", body: file }).catch(() => null);
  if (!response) return { error: "Connexion perdue, réessaie." };
  const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
  return body.url ? { url: body.url } : { error: body.error ?? "Image refusée." };
}

function SideField({ side, id, value, onChange, inputRef, onKeyDown, enterHint, hint }: {
  side: Side; id: string; value: string; onChange: (value: string) => void; inputRef: RefObject<HTMLTextAreaElement | null>;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void; enterHint: "next" | "done" | "enter"; hint: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const max = side === "front" ? FRONT_MAX : BACK_MAX;
  const apply = (edit: Edit) => {
    onChange(edit.value);
    // La sélection se replace après le rendu : on garde la main au clavier
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(edit.start, edit.end); });
  };
  const format = (kind: FormatKind) => {
    const area = inputRef.current;
    apply(applyFormat(value, area?.selectionStart ?? value.length, area?.selectionEnd ?? value.length, kind));
  };
  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError("");
    const result = await uploadCardImage(file);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if ("error" in result) { setError(result.error); return; }
    const area = inputRef.current;
    const at = area?.selectionStart ?? value.length;
    const before = at > 0 && value[at - 1] !== "\n" ? "\n" : "";
    apply(insertAt(value, at, area?.selectionEnd ?? at, `${before}![image](${result.url})\n`));
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const kind = shortcutOf(event);
    if (kind) { event.preventDefault(); format(kind); return; }
    onKeyDown(event);
  };
  const title = side === "front" ? "Recto" : "Verso";
  return (
    <div className="grid gap-1.5 rounded-xl bg-card p-3 shadow-xs ring-1 ring-border/60 focus-within:ring-2 focus-within:ring-ring/50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id} className="gap-1.5">
          <span className="font-semibold">{title}</span>
          <span className="font-normal text-muted-foreground">{side === "front" ? "· la question" : "· la réponse"}</span>
        </Label>
        <div role="toolbar" aria-label={`Mise en forme du ${title.toLowerCase()}`} aria-controls={id} className="flex items-center gap-0.5">
          {TOOLS.map((tool) => (
            <Button key={tool.kind} type="button" variant="ghost" size="icon-sm" className="coarse:size-11" title={`${tool.label} (${tool.keys})`} aria-label={tool.label} onMouseDown={(e) => e.preventDefault()} onClick={() => format(tool.kind)}>
              <Icon icon={tool.icon} size={16} />
            </Button>
          ))}
          <Button type="button" variant="ghost" size="icon-sm" className="coarse:size-11" title="Image" aria-label="Ajouter une image" pending={uploading} onClick={() => fileRef.current?.click()}>
            <Icon icon={IconImage} size={16} />
          </Button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void pickImage(e.target.files?.[0])} />
        </div>
      </div>
      <Textarea
        ref={inputRef} id={id} name={side} rows={side === "front" ? 2 : 3} required maxLength={max} value={value}
        onChange={(e) => onChange(e.target.value)} onKeyDown={keyDown} enterKeyHint={enterHint} autoFocus={side === "front"} aria-describedby={`${id}-hint`}
        className="min-h-0 border-0 bg-transparent px-1 text-base shadow-none focus-visible:ring-0"
      />
      <p id={`${id}-hint`} className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>{hint}</span>
        {value.length > max * 0.8 && <span className="tabular-nums">{value.length}/{max}</span>}
      </p>
      {error && <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive-foreground"><Icon icon={IconError} size={16} />{error}</p>}
    </div>
  );
}

/** La carte telle qu'elle sera en séance : on la retourne d'un clic, d'Espace ou d'Entrée. Fondu seul en mouvement réduit. */
export function CardPreview({ front, back }: { front: string; back: string }) {
  const [flipped, setFlipped] = useState(false);
  const face = "col-start-1 row-start-1 flex min-h-40 flex-col justify-center gap-2 rounded-2xl bg-card p-5 shadow-sm [backface-visibility:hidden] motion-reduce:[backface-visibility:visible]";
  return (
    <div className="grid gap-2">
      <p className="text-sm font-semibold">Aperçu</p>
      <button
        type="button" onClick={() => setFlipped((f) => !f)} aria-pressed={flipped}
        aria-label={flipped ? "Aperçu du verso, retourner la carte" : "Aperçu du recto, retourner la carte"}
        className="group grid text-left [perspective:1200px] focus-visible:outline-none"
      >
        <span className={cn("grid transition-transform duration-(--dur-slow) ease-(--ease-out) [transform-style:preserve-3d] motion-reduce:transition-none", flipped && "[transform:rotateY(180deg)] motion-reduce:[transform:none]")}>
          <span className={cn(face, "group-focus-visible:ring-3 group-focus-visible:ring-ring/50", flipped && "motion-reduce:invisible")}>
            <span className="text-xs text-muted-foreground">Recto</span>
            {front.trim() ? <CardText text={front} className="text-lg font-semibold text-pretty" /> : <span className="text-muted-foreground">La question apparaîtra ici</span>}
          </span>
          <span className={cn(face, "[transform:rotateY(180deg)] motion-reduce:[transform:none] group-focus-visible:ring-3 group-focus-visible:ring-ring/50", !flipped && "motion-reduce:invisible")}>
            <span className="text-xs text-muted-foreground">Verso</span>
            {back.trim() ? <CardText text={back} className="text-lg text-pretty" /> : <span className="text-muted-foreground">La réponse apparaîtra ici</span>}
          </span>
        </span>
      </button>
      <p className="text-xs text-muted-foreground">Touche la carte pour la retourner</p>
    </div>
  );
}

/**
 * L'éditeur d'une fiche : recto et verso bien séparés, mise en forme légère (gras, italique, listes),
 * formules `$ … $` et `$$ … $$`, image, aperçu de la carte retournable. Entrée au recto passe au verso ;
 * Entrée au verso (ou Ctrl+Entrée partout) ajoute la fiche et revient au recto, pour enchaîner.
 */
function Composer({ idPrefix, front, back, onFront, onBack, frontRef }: {
  idPrefix: string; front: string; back: string; onFront: (v: string) => void; onBack: (v: string) => void; frontRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const backRef = useRef<HTMLTextAreaElement>(null);
  // Au toucher, Entrée garde son rôle de retour à la ligne au verso : on ajoute avec le bouton
  const coarse = useCoarsePointer();
  const submit = (event: KeyboardEvent<HTMLTextAreaElement>) => { event.preventDefault(); event.currentTarget.form?.requestSubmit(); };
  const onFrontKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    if (event.ctrlKey || event.metaKey) return submit(event);
    if (!event.shiftKey) { event.preventDefault(); backRef.current?.focus(); }
  };
  const onBackKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    if (event.ctrlKey || event.metaKey || (!event.shiftKey && !coarse)) submit(event);
  };
  return (
    // Requête de conteneur : dans une feuille étroite, l'aperçu passe sous les champs
    <div className="@container">
    <div className="grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] @3xl:items-start">
      <div className="grid gap-3">
        <SideField side="front" id={`${idPrefix}-front`} value={front} onChange={onFront} inputRef={frontRef} onKeyDown={onFrontKey} enterHint="next" hint={coarse ? "Entrée : passer au verso" : "Entrée : passer au verso · Maj+Entrée : nouvelle ligne"} />
        <SideField side="back" id={`${idPrefix}-back`} value={back} onChange={onBack} inputRef={backRef} onKeyDown={onBackKey} enterHint={coarse ? "enter" : "done"} hint={coarse ? "Formules entre $ … $ ou $$ … $$" : "Entrée ou Ctrl+Entrée : ajouter · Maj+Entrée : nouvelle ligne · formules entre $ … $"} />
        <p className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground fine:flex">
          <span><Kbd>Ctrl B</Kbd> gras</span><span><Kbd>Ctrl I</Kbd> italique</span><span><Kbd>Ctrl Maj L</Kbd> liste</span><span><Kbd>Ctrl M</Kbd> formule</span><span><Kbd>Ctrl Maj M</Kbd> formule centrée</span>
        </p>
      </div>
      <CardPreview front={front} back={back} />
    </div>
    </div>
  );
}

/** Nouvelle fiche : le cours choisi reste pour la suivante ; `course` fixé n'affiche pas de choix. */
export function NewCardForm({ courses = [], course: fixed, onAdded }: { courses?: { id: string; title: string }[]; course?: string; onAdded?: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createCard, null);
  const [course, setCourse] = useState(fixed ?? courses[0]?.id ?? "");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [added, setAdded] = useState(0);
  const frontRef = useRef<HTMLTextAreaElement>(null);
  // Une fiche ajoutée : les champs se vident pour la suivante, le focus revient au recto
  useEffect(() => {
    if (!state?.ok) return;
    setFront(""); setBack(""); // eslint-disable-line react-hooks/set-state-in-effect -- réponse du serveur
    setAdded((n) => n + 1);
    frontRef.current?.focus();
    onAdded?.();
  }, [state, onAdded]);
  return (
    <form action={action} className="grid gap-4 pb-4">
      {course && <input type="hidden" name="document" value={course} />}
      {!fixed && courses.length > 0 && (
        <div className="grid gap-2">
          <Label id="card-course">Cours</Label>
          <ToggleGroup aria-labelledby="card-course" value={[course]} onValueChange={(v: string[]) => setCourse(v[0] ?? "")} className="flex-wrap justify-start">
            {courses.map((c) => <ToggleGroupItem key={c.id} value={c.id} variant="outline" className="max-w-full"><span className="truncate">{c.title || "Sans titre"}</span></ToggleGroupItem>)}
          </ToggleGroup>
        </div>
      )}
      <Composer idPrefix="card" front={front} back={back} onFront={setFront} onBack={setBack} frontRef={frontRef} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" pending={pending}>Ajouter la fiche</Button>
        {state?.ok && <p role="status" className="rise flex items-center gap-1.5 text-sm text-success-foreground"><Icon icon={IconDone} size={16} />{state.ok.replace(/\.$/, "")}{added > 1 && <span className="tabular-nums text-muted-foreground"> · {added} à la suite</span>}</p>}
        {state?.error && <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive-foreground"><Icon icon={IconError} size={16} />{state.error}</p>}
      </div>
    </form>
  );
}

/** Corriger une fiche : son état FSRS ne bouge pas. */
export function EditCardForm({ card, onSaved }: { card: { id: string; front: string; back: string }; onSaved: (text: { front: string; back: string }) => void }) {
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const frontRef = useRef<HTMLTextAreaElement>(null);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    const result = await updateCard(card.id, { front, back }).catch(() => ({ error: "Connexion perdue, réessaie." }));
    setPending(false);
    if ("error" in result) setError(result.error);
    else onSaved({ front: front.trim(), back: back.trim() });
  };
  return (
    <form onSubmit={(e) => void save(e)} className="grid gap-4 pb-4">
      <Composer idPrefix={`edit-${card.id}`} front={front} back={back} onFront={setFront} onBack={setBack} frontRef={frontRef} />
      {error && <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive-foreground"><Icon icon={IconError} size={16} />{error}</p>}
      <Button type="submit" pending={pending}>Enregistrer</Button>
    </form>
  );
}
