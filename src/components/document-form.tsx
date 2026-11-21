"use client";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { discardNewDocument, saveDocument } from "@/app/actions/admin/content";
import { sendFile } from "@/lib/upload-client";
import { Field, selectClass, TextField } from "@/components/field";
import { Notice } from "@/components/action-form";
import { Attest } from "@/components/attest";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CATEGORIES, RIGHTS } from "@/lib/db/categories";
import { Icon } from "@/components/icon";
import { IconClose, IconCloudUpload } from "@/lib/icons";


type Initial = {
  id: string; title: string; category: string; subject: string; academicYear: string; teacherName: string; chapter: string; kind: string; rights: string;
  description: string; externalUrl: string; published: boolean; kindLabel: string; syncError: string | null;
};

const SOURCES = [
  ["write", "Rédiger un cours"], ["paste", "Coller un artefact"], ["page", "Fichier HTML, JSX ou MD"], ["zip", "Archive ZIP"], ["notion", "Notion"], ["none", "Aucun"],
] as const;

export function DropZone({ name, label, hint, accept, multiple }: { name: string; label: string; hint: string; accept?: string; multiple?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const sync = () => setFiles([...(input.current?.files ?? [])]);
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    if (!input.current || !event.dataTransfer.files.length) return;
    input.current.files = event.dataTransfer.files;
    sync();
  };
  const remove = (index: number) => {
    if (!input.current) return;
    const kept = new DataTransfer();
    files.forEach((file, i) => { if (i !== index) kept.items.add(file); });
    input.current.files = kept.files;
    sync();
  };
  return (
    <div className="grid gap-2">
      <label
        onDragOver={(event) => { event.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-[var(--radius)] border border-dashed px-4 py-7 text-center transition-[border-color,background-color,transform] duration-150 has-focus-visible:ring-3 has-focus-visible:ring-ring/40 ${over ? "scale-[1.01] border-primary bg-accent" : "border-input bg-card hover:border-primary"}`}
      >
        <Icon icon={IconCloudUpload} className={`size-6 transition-transform duration-200 ${over ? "-translate-y-1 text-[var(--link)]" : "text-muted-foreground"}`} />
        <span className="font-semibold">{label}</span>
        <span className="text-sm text-muted-foreground">{hint}</span>
        <input ref={input} type="file" name={name} accept={accept} multiple={multiple} onChange={sync} className="sr-only" />
      </label>
      <AnimatePresence initial={false}>
        {files.map((file, index) => (
          <motion.div key={`${file.name}-${file.size}`} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2 text-[0.95rem]">
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <span className="text-sm text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1).replace(".", ",")} Mo</span>
            <button type="button" aria-label={`Retirer ${file.name}`} onClick={() => remove(index)} className="press rounded p-1 text-muted-foreground hover:text-foreground"><Icon icon={IconClose} className="size-4" /></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

type SubjectOption = { id: number; name: string; level: number; program: string };

export function DocumentForm({ initial, subjects, notionReady, presetSubject }: { initial?: Initial; subjects: SubjectOption[]; notionReady: boolean; presetSubject?: string }) {
  const router = useRouter();
  const [source, setSource] = useState<string>(initial ? "keep" : "write");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [percent, setPercent] = useState(0);
  const documentId = useRef(initial?.id ?? "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const attachments = form.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0);
    const main = form.get("mainFile");
    const mainFile = main instanceof File && main.size > 0 ? main : null;
    if ((source === "page" || source === "zip") && !mainFile) {
      setError("Choisis un fichier.");
      return;
    }
    for (const name of ["attachments", "mainFile"]) form.delete(name);
    if (documentId.current) form.set("id", documentId.current);
    setProgress("Enregistrement…");
    try {
      const saved = await saveDocument(form);
      if (saved.error || !saved.id) throw new Error(saved.error ?? "Enregistrement impossible.");
      documentId.current = saved.id;
      const total = attachments.reduce((sum, f) => sum + f.size, 0) + (mainFile?.size ?? 0);
      let sent = 0;
      const onBytes = (bytes: number) => {
        sent += bytes;
        const value = Math.round((sent / Math.max(total, 1)) * 100);
        setPercent(value);
        setProgress(value >= 100 ? "Finalisation…" : `Envoi en cours, ${value}\u00a0%`);
      };
      if (mainFile) await sendFile(saved.id, source === "zip" ? "zip" : "page", mainFile, onBytes);
      for (const file of attachments) await sendFile(saved.id, "attachment", file, onBytes);
      router.push(saved.edit ? `/editer/${saved.id}` : `/d/${saved.id}`);
      router.refresh();
    } catch (failure) {
      if (!initial && documentId.current) {
        await discardNewDocument(documentId.current).catch(() => undefined);
        documentId.current = "";
      }
      // Next masque le détail des erreurs serveur imprévues : le message affiché reste générique
      setError((failure as Error).message || "Enregistrement impossible.");
      setProgress(null);
      setPercent(0);
    }
  }

  const options = initial ? [["keep", "Conserver"] as const, ...SOURCES] : SOURCES;
  return (
    <form onSubmit={submit} className="grid max-w-3xl gap-5">
      <Field label="Titre" name="title" required maxLength={200} defaultValue={initial?.title} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="category" className="text-[0.95rem]">Type</Label>
          <select id="category" name="category" defaultValue={initial?.category ?? "cours"} className={selectClass}>
            {Object.entries(CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="subject" className="text-[0.95rem]">Matière</Label>
          <select id="subject" name="subject" required defaultValue={initial?.subject ?? presetSubject ?? ""} className={selectClass}>
            <option value="" disabled>Choisir…</option>
            {[...new Set(subjects.map((o) => `${o.program}|${o.level}`))].map((group) => {
              const [program, level] = group.split("|");
              return <optgroup key={group} label={`${program}, L${level}`}>{subjects.filter((o) => o.program === program && o.level === Number(level)).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</optgroup>;
            })}
          </select>
        </div>
        <Field label="Numéro de chapitre" hint=" (pour classer les cours)" name="chapter" type="number" min={1} max={999} defaultValue={initial?.chapter} />
        <Field label="Année universitaire" hint=" (utile pour un partiel)" name="academicYear" placeholder="2025-2026" maxLength={9} defaultValue={initial?.academicYear} />
        <Field label="Enseignant" hint=" (facultatif)" name="teacherName" placeholder="M. Dupont" maxLength={80} defaultValue={initial?.teacherName} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="rights" className="text-[0.95rem]">Origine du contenu</Label>
        <select id="rights" name="rights" required defaultValue={initial && initial.rights !== "unknown" ? initial.rights : ""} className={selectClass}>
          <option value="" disabled>Choisir…</option>
          {Object.entries(RIGHTS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
      <TextField label="Description" name="description" rows={3} maxLength={5000} defaultValue={initial?.description} />
      <Field label="Lien externe" hint=" (dépôt d’un projet, facultatif)" name="externalUrl" type="url" defaultValue={initial?.externalUrl} />

      <section className="grid min-w-0 gap-3 border-t border-border pt-6">
        <h2 className="text-lg font-semibold">Ce qui s’affiche dans la page</h2>
        {initial && <p className="-mt-2 text-[0.95rem] text-muted-foreground">Actuellement : {initial.kindLabel}{initial.kind === "editor" && <> (<a className="text-[var(--link)] underline underline-offset-2" href={`/editer/${initial.id}`}>ouvrir l’éditeur</a>)</>}</p>}
        {initial?.syncError && <Notice tone="error">{initial.syncError}</Notice>}
        <LayoutGroup id="source">
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Source du contenu">
            {options.map(([value, label]) => (
              <label key={value} className={`relative cursor-pointer rounded-[var(--radius)] px-3 py-1.5 text-[0.95rem] transition-colors duration-150 has-focus-visible:ring-3 has-focus-visible:ring-ring/40 ${source === value ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {source === value && <motion.span layoutId="source-pill" className="absolute inset-0 rounded-[var(--radius)] bg-primary" />}
                <input type="radio" name="source" value={value} checked={source === value} onChange={() => setSource(value)} className="sr-only" />
                <span className="relative">{label}</span>
              </label>
            ))}
          </div>
        </LayoutGroup>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={source} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} className="grid gap-2 empty:hidden">
            {source === "write" && <p className="text-[0.95rem] text-muted-foreground">Après l’enregistrement, l’éditeur s’ouvre avec la mise en page commune. C’est là que tu pourras transcrire des photos avec l’IA.</p>}
            {source === "paste" && <TextField label="Code de l’artefact" hint=" (HTML, React ou Markdown, reconnu tout seul)" name="pasted" rows={10} spellCheck={false} className="font-mono text-[0.8rem] [field-sizing:fixed]" />}
            {source === "page" && <DropZone name="mainFile" label="Dépose la page ici" hint=".html, .jsx, .tsx ou .md" accept=".html,.htm,.jsx,.tsx,.md,.markdown" />}
            {source === "zip" && <DropZone name="mainFile" label="Dépose l’archive ici" hint="Pour un export Notion : Exporter, format HTML, avec les sous-pages." accept=".zip" />}
            {source === "notion" && (notionReady ? (
              <>
                <Field label="Lien de la page Notion" name="notionUrl" type="url" placeholder="https://www.notion.so/…" required />
                <p className="text-[0.95rem] text-muted-foreground">Dans Notion : menu ⋯ de la page, Connexions, ajoute l’intégration. La copie se met à jour chaque jour.</p>
              </>
            ) : (
              <Notice tone="info">Notion n’est pas encore connecté (NOTION_TOKEN). En attendant, utilise un export ZIP.</Notice>
            ))}
          </motion.div>
        </AnimatePresence>
      </section>

      <section className="grid min-w-0 gap-3 border-t border-border pt-6">
        <h2 className="text-lg font-semibold">Fichiers à télécharger</h2>
        <DropZone name="attachments" multiple label="Dépose tes fichiers ici" hint="Sujet et corrigé d’un partiel, PDF, archives… 200 Mo maximum par fichier." />
      </section>

      <label className="flex items-baseline gap-2.5 border-t border-border pt-6">
        <input type="checkbox" name="published" defaultChecked={initial?.published ?? true} className="size-4 translate-y-0.5 accent-[var(--primary)]" />
        <span>Publier pour tous les membres<span className="block text-[0.95rem] text-muted-foreground">Décoché, le document reste un brouillon visible par les administrateurs.</span></span>
      </label>
      <Attest kind="share" />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-4 border-t border-border bg-background px-1 py-3">
        <Button type="submit"  disabled={progress !== null}>Enregistrer</Button>
        {progress && (
          <div role="status" className="flex min-w-48 flex-1 items-center gap-3 text-[0.95rem] text-muted-foreground">
            <span>{progress}</span>
            <span aria-hidden="true" className="h-1 flex-1 overflow-hidden rounded-full bg-muted"><motion.span className="block h-full bg-primary" animate={{ width: `${percent}%` }} /></span>
          </div>
        )}
      </div>
    </form>
  );
}
