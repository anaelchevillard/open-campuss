"use client";

import { useCreateBlockNote } from "@blocknote/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fr as dayFr } from "react-day-picker/locale";
import { deleteBlogPost, publishBlogPost, saveBlogPost, setBlogCover, unpublishBlogPost } from "@/app/actions/blog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CoverPicker } from "@/components/cover-picker";
import { Icon } from "@/components/icon";
import type { TocItem } from "@/components/reading/doc-frame";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { IconDelete, IconEye, IconHidden, IconMore } from "@/lib/icons";
import { toast } from "@/lib/toast";
import { EditorSurface } from "./block-editor";
import { frenchDictionary, makeUploader } from "./doc-editor-inner";
import { PageEditor, SaveStatus, useAutosave } from "./page-editor";
import { campussSchema, type CampussEditor } from "./schema";

export type BlogEditorProps = {
  id: string; title: string; initial: unknown[]; coverFileId: string | null; published: boolean; pinned: boolean; notify: boolean;
  scheduledAt: string | null; author: string;
};

const HOURS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

function outlineOf(editor: CampussEditor): TocItem[] {
  const items: TocItem[] = [];
  for (const block of editor.document as { id: string; type: string; props?: { level?: number }; content?: unknown }[]) {
    if (block.type !== "heading" || !Array.isArray(block.content)) continue;
    const text = (block.content as { text?: string }[]).map((c) => c.text ?? "").join("").trim();
    if (text) items.push({ id: block.id, text, depth: (block.props?.level ?? 2) <= 2 ? 2 : 3 });
  }
  return items;
}

/** Écrire une actualité sur sa page publique : même éditeur que les cours, enregistrement automatique, un seul « Publier ». */
export function BlogEditorInner({ id, title: initialTitle, initial, coverFileId, published, pinned, notify, scheduledAt, author }: BlogEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const titleRef = useRef(initialTitle);
  const titleArea = useRef<HTMLTextAreaElement>(null);
  const [dialog, setDialog] = useState<"publish" | "delete" | null>(null);
  const [options, setOptions] = useState({ notify, pinned, schedule: Boolean(scheduledAt), day: scheduledAt ? new Date(scheduledAt) : undefined as Date | undefined, hour: scheduledAt ? new Date(scheduledAt).toTimeString().slice(0, 5) : "08:00" });
  const [publishing, setPublishing] = useState(false);
  const [problem, setProblem] = useState("");
  const editor = useCreateBlockNote({ schema: campussSchema, dictionary: frenchDictionary, uploadFile: makeUploader(`/actualites/images?post=${id}`, (message) => toast(message)), initialContent: initial.length ? initial : undefined } as never) as unknown as CampussEditor;
  const [toc, setToc] = useState<TocItem[]>(() => outlineOf(editor));
  const autosave = useAutosave(async () => (await saveBlogPost(id, titleRef.current, editor.document)).error);

  useEffect(() => {
    const el = titleArea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  const when = () => {
    if (!options.schedule || !options.day) return null;
    const [h, m] = options.hour.split(":").map(Number);
    const at = new Date(options.day);
    at.setHours(h, m, 0, 0);
    return at;
  };

  const publish = async () => {
    setPublishing(true);
    setProblem("");
    await autosave.flush();
    const at = when();
    const result: { error?: string; scheduled?: boolean } = await publishBlogPost(id, { notify: options.notify, pinned: options.pinned, scheduledAt: at ? at.toISOString() : null }).catch(() => ({ error: "La publication a échoué. Réessaie." }));
    setPublishing(false);
    if (result.error) return setProblem(result.error);
    setDialog(null);
    toast(result.scheduled ? `Programmée le ${at!.toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : published ? "Actualité mise à jour" : "Actualité publiée");
    router.refresh();
  };

  const actions = (
    <>
      <Button onClick={() => { setProblem(""); setDialog("publish"); }}>{published ? "Mettre à jour" : "Publier"}</Button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Autres actions" />}><Icon icon={IconMore} /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {published && <DropdownMenuItem render={<Link href={`/actualites/${id}`} />}><Icon icon={IconEye} size={16} />Voir la page</DropdownMenuItem>}
          {(published || scheduledAt) && <DropdownMenuItem onClick={async () => { await unpublishBlogPost(id); toast("Actualité dépubliée"); router.refresh(); }}><Icon icon={IconHidden} size={16} />Dépublier</DropdownMenuItem>}
          <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}><Icon icon={IconDelete} size={16} />Supprimer</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <>
      <PageEditor editor={editor} toc={toc} status={<SaveStatus state={autosave.state} />} actions={actions}>
        <header className="group/header">
          <CoverPicker src={coverFileId ? `/actualites/images/${coverFileId}` : null} uploadUrl={`/actualites/images?post=${id}&cover=1`} onRemove={() => setBlogCover(id, null)} />
          <p className="text-sm font-semibold text-brand-text">Actualité</p>
          <textarea ref={titleArea} name="title" rows={1} maxLength={200} aria-label="Titre" placeholder="Sans titre" value={title}
            onChange={(event) => { const next = event.target.value.replace(/\n/g, " "); setTitle(next); titleRef.current = next; autosave.touch(); }}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); editor.focus(); } }}
            className="doc-title title mt-1 w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-muted-foreground/60" />
          <p className="mt-2 text-sm text-muted-foreground">{author}{scheduledAt && !published ? ` · programmée le ${new Date(scheduledAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</p>
        </header>
        {autosave.error && <p role="alert" className="mt-4 text-sm text-destructive">{autosave.error}</p>}
        <div className="doc-editor mt-8">
          <EditorSurface editor={editor} label="Texte de l’actualité" onChange={() => { setToc((old) => { const next = outlineOf(editor); return JSON.stringify(old) === JSON.stringify(next) ? old : next; }); autosave.touch(); }} />
        </div>
      </PageEditor>

      <ResponsiveSheet open={dialog === "publish"} onOpenChange={(open) => { if (!open) setDialog(null); }} title={published ? "Mettre à jour l’actualité" : "Publier l’actualité"} description="Visible sans compte, sur la page Actualités"
        footer={<Button pending={publishing} onClick={() => void publish()}>{options.schedule && when() ? "Programmer" : published ? "Mettre à jour" : "Publier"}</Button>}>
        <div className="grid gap-4 pb-2">
          <label className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold">Prévenir les étudiants</span><Switch checked={options.notify} onCheckedChange={(v) => setOptions((o) => ({ ...o, notify: v }))} /></label>
          <label className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold">Épingler en tête</span><Switch checked={options.pinned} onCheckedChange={(v) => setOptions((o) => ({ ...o, pinned: v }))} /></label>
          <label className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold">Programmer</span><Switch checked={options.schedule} onCheckedChange={(v) => setOptions((o) => ({ ...o, schedule: v, day: o.day ?? new Date(Date.now() + 86_400_000) }))} /></label>
          {options.schedule && (
            <div className="grid justify-items-start gap-2 animate-in fade-in-0 duration-150">
              <Calendar mode="single" locale={dayFr} selected={options.day} onSelect={(day) => setOptions((o) => ({ ...o, day: day ?? o.day }))} disabled={{ before: today }} className="rounded-lg border border-border" />
              <label className="flex items-center gap-2 text-sm"><span className="font-semibold">Heure</span>
                <NativeSelect aria-label="Heure de publication" value={options.hour} onChange={(event) => setOptions((o) => ({ ...o, hour: event.target.value }))}>
                  {HOURS.map((h) => <NativeSelectOption key={h} value={h}>{h.replace(":", " h ")}</NativeSelectOption>)}
                </NativeSelect>
              </label>
            </div>
          )}
          {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
        </div>
      </ResponsiveSheet>

      <ConfirmDialog open={dialog === "delete"} onOpenChange={(open) => { if (!open) setDialog(null); }} title="Supprimer cette actualité ?" description="Son texte et ses images seront effacés." confirmLabel="Supprimer" level="danger"
        onConfirm={() => { const form = new FormData(); form.set("id", id); void deleteBlogPost(form); }} />
    </>
  );
}
