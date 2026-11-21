"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { startDraft } from "@/app/actions/connected";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { markdownToBlocks } from "@/lib/blocks";
import { courseTemplate } from "@/lib/course-template";
import { IconAiScan, IconCloudUpload, IconFile, IconUpload, type IconData } from "@/lib/icons";
import { keepPendingFiles, takePendingFiles } from "@/lib/pending-files";
import { toastError } from "@/lib/toast";
import { ImportProgress } from "./import-progress";
import { clearPrepared, failJob, importFile, importSource, type ImportTarget, prepareJob, type Provider, queuePhotos, setImportTarget, useImportJob } from "./import-jobs";
import { isImage, isPdf, MAX_PAGES, type PhotoPage, photoPage, readPdf } from "./photo-pages";
import { PROVIDER_ICON, PROVIDER_LABEL, SourcePicker, startHref } from "./source-picker";
import { type ImportStatus, useImportStatus } from "./use-import-status";

export type Depart = "photo" | "notion" | "google" | "fichier";
export type { ImportTarget } from "./import-jobs";
export { useImportBusy } from "./import-jobs";

const FILE_TYPES = ".docx,.pages,.pdf,.md,.markdown,.txt,.zip,.enex,.html,.htm";
const FORMATS = "Word, Pages, PDF, Markdown, Obsidian, Evernote, export Notion";
const RESULTS: Record<string, string> = {
  annule: "Connexion annulée : rien n’a été relié",
  refuse: "Ce lien de connexion n’est plus valable. Recommence",
  echec: "La connexion n’a pas abouti. Réessaie dans un instant",
};
// Un départ (?depart=) ne se rejoue pas quand les tuiles se remontent
const handled = new Set<string>();

const tileClass = "group relative flex min-h-18 cursor-pointer items-center gap-3 rounded-2xl bg-card p-3 text-left shadow-xs outline-none transition-[box-shadow,translate,scale] duration-(--dur-base) ease-(--ease-out) hover-ok:shadow-sm hover-ok:motion-ok:-translate-y-0.5 active:scale-[.985] focus-visible:ring-3 focus-visible:ring-ring/40 has-focus-visible:ring-3 has-focus-visible:ring-ring/40";

function TileBody({ icon, title, state }: { icon: IconData; title: string; state?: ReactNode }) {
  return (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"><Icon icon={icon} /></span>
      <span className="grid min-w-0">
        <span className="font-semibold leading-snug">{title}</span>
        {state && <span className="text-sm text-muted-foreground">{state}</span>}
      </span>
    </>
  );
}

/** Retire de l'adresse ce qui a servi au départ : recharger ne doit pas le rejouer. */
function readAndCleanUrl() {
  const url = new URL(window.location.href);
  const result = url.searchParams.get("resultat");
  for (const key of ["depart", "resultat", "service", "importer"]) url.searchParams.delete(key);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return result;
}

/**
 * « Commencer avec… » sur un brouillon vierge : photo ou PDF avec Campuss IA, Notion, Google Docs, fichier.
 * Dans l'éditeur, `target` reçoit ce qui arrive ; ailleurs (état vide de Mes documents), les tuiles mènent à un brouillon.
 * Une tuile dont le service n'est pas configuré, ou coupé par l'administration, n'existe pas.
 */
export function StartTiles({ documentId, depart, subjectId, onStarted, target, category = "cours" }: { documentId: string; depart?: Depart; subjectId?: number; onStarted?: () => void; target?: ImportTarget; category?: string }) {
  const router = useRouter();
  const [status] = useImportStatus(documentId);
  const job = useImportJob(documentId);
  const [picker, setPicker] = useState<Provider | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const inEditor = Boolean(target && documentId);

  useEffect(() => { if (target && documentId) setImportTarget(documentId, target); }, [target, documentId]);

  /** Hors de l'éditeur : un brouillon d'abord, puis l'éditeur reprend avec le même départ. */
  const openDraft = useCallback(async (start: Depart) => {
    let id = documentId;
    if (!id) {
      const created = await startDraft(subjectId ?? null);
      if ("error" in created) return toastError(created.error);
      id = created.id;
    }
    router.push(`/editer/${id}?depart=${start}`);
  }, [documentId, subjectId, router]);

  const receive = useCallback(async (list: File[], state: ImportStatus | null = status) => {
    if (!list.length || !state) return;
    if (!inEditor) {
      keepPendingFiles(list);
      return void openDraft("photo");
    }
    onStarted?.();
    const pages: PhotoPage[] = [];
    const others: File[] = [];
    try {
      for (const file of list) {
        if (isImage(file) && state.ocr) {
          prepareJob(documentId, "Préparation des photos…");
          if (pages.length < MAX_PAGES) pages.push(await photoPage(file));
        } else if (isPdf(file) && state.ocr) {
          prepareJob(documentId, `Lecture de « ${file.name} »…`);
          const read = await readPdf(file);
          if (read.scanned) pages.push(...read.pages.slice(0, MAX_PAGES - pages.length));
          else others.push(file);
        } else if (!isImage(file)) others.push(file);
      }
    } catch (error) {
      return failJob(documentId, (error as Error).message || "Ce fichier n’a pas pu être lu.");
    }
    clearPrepared(documentId);
    for (const file of others) {
      const reply = await importFile(documentId, file);
      if (reply?.scanned) failJob(documentId, "Ce PDF est fait de photos de pages, et Campuss IA n’est pas disponible pour le transcrire.");
    }
    if (pages.length) queuePhotos(documentId, pages, { accepted: state.ocrAccepted, left: state.pagesLeft });
  }, [status, inEditor, onStarted, documentId, openDraft]);

  // Départ demandé depuis « Commencer avec… » : on reprend où l'étudiant en était
  useEffect(() => {
    if (!depart || !status || !inEditor) return;
    const key = `${documentId}:${depart}`;
    if (handled.has(key)) return;
    handled.add(key);
    const result = readAndCleanUrl();
    if (depart === "photo") { void receive(takePendingFiles(), status); return; }
    if (depart === "fichier") { fileInput.current?.click(); return; }
    const account = status.accounts.find((a) => a.provider === depart);
    if (!account) return;
    if (result && result !== "ok") { toastError(RESULTS[result] ?? RESULTS.echec); return; }
    // Ouvert au tour suivant : le sélecteur s'affiche une fois les tuiles en place
    if (account.connected && !account.broken) { window.setTimeout(() => setPicker(depart), 0); return; }
    // Venu de « Importer de Notion » sans compte relié : l'aller-retour commence tout de suite
    if (!result) window.location.assign(startHref(depart, `/editer/${documentId}?depart=${depart}`));
  }, [depart, status, inEditor, documentId, receive]);

  // La page entière accepte le dépôt d'un fichier tant que le brouillon est vierge
  useEffect(() => {
    if (!inEditor || job) return;
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const over = (event: DragEvent) => { if (!hasFiles(event)) return; event.preventDefault(); setDragging(true); };
    const leave = (event: DragEvent) => { if (!event.relatedTarget) setDragging(false); };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      setDragging(false);
      void receive([...(event.dataTransfer?.files ?? [])]);
    };
    document.addEventListener("dragover", over, true);
    document.addEventListener("dragleave", leave, true);
    document.addEventListener("drop", drop, true);
    return () => { document.removeEventListener("dragover", over, true); document.removeEventListener("dragleave", leave, true); document.removeEventListener("drop", drop, true); };
  }, [inEditor, job, receive]);

  if (job && inEditor) return <ImportProgress documentId={documentId} job={job} accepted={Boolean(status?.ocrAccepted)} onAdd={(files) => void receive(files)} />;
  if (!status) return null;

  const accounts = status.accounts;
  const choose = (event: React.ChangeEvent<HTMLInputElement>) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; void receive(files); };

  return (
    <section aria-label="Commencer avec…" className="@container grid gap-3">
      {status.ocr && (
        <div className="grid gap-1 motion-ok:animate-rise">
          <label data-animate="" className="ai-border ai-glow flex min-h-24 cursor-pointer items-center gap-4 rounded-2xl p-4 outline-none has-focus-visible:ring-3 has-focus-visible:ring-ring/40">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--ai-3)_10%,var(--card))] text-[var(--ai-3)]"><Icon icon={IconAiScan} size={24} className="ai-spark" /></span>
            <span className="grid gap-0.5">
              <span className="ai-text text-base font-semibold">Photo ou PDF avec Campuss IA</span>
              <span className="text-sm text-muted-foreground">Tes notes deviennent un cours à relire</span>
            </span>
            {/* capture : au téléphone, un toucher ouvre directement l'appareil photo */}
            <input type="file" accept="image/*,application/pdf" capture="environment" multiple aria-label="Prendre une photo ou choisir un PDF" className="sr-only" onChange={choose} />
          </label>
          <label className="hidden min-h-11 w-fit cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-semibold text-link coarse:inline-flex">
            <Icon icon={IconUpload} size={16} />Choisir un fichier
            <input type="file" accept="image/*,application/pdf" multiple className="sr-only" onChange={choose} />
          </label>
        </div>
      )}
      {(accounts.length > 0 || status.files) && (
        <div className="stagger grid grid-cols-2 gap-3 @[30rem]:grid-cols-3">
          {accounts.map((account) => {
            const ready = account.connected && !account.broken;
            const state = account.broken ? "À reconnecter" : account.connected ? "Connecté" : "Connecter";
            const body = <TileBody icon={PROVIDER_ICON[account.provider]} title={PROVIDER_LABEL[account.provider]} state={state} />;
            if (!inEditor) return <button key={account.provider} type="button" className={tileClass} onClick={() => void openDraft(account.provider)}>{body}</button>;
            return ready
              ? <button key={account.provider} type="button" className={tileClass} onClick={() => { onStarted?.(); setPicker(account.provider); }}>{body}</button>
              : <a key={account.provider} className={tileClass} href={startHref(account.provider, `/editer/${documentId}?depart=${account.provider}`)}>{body}</a>;
          })}
          {status.files && (
            inEditor
              ? (
                <Tooltip>
                  <TooltipTrigger render={<label className={tileClass} />}>
                    <TileBody icon={IconFile} title="Fichier" state={<><span className="coarse:hidden">ou dépose-le ici</span><span className="hidden coarse:inline">Word, PDF…</span></>} />
                    <input ref={fileInput} type="file" multiple aria-label="Fichier à importer" accept={`${FILE_TYPES}${status.ocr ? ",image/*" : ""}`} className="sr-only" onChange={choose} />
                  </TooltipTrigger>
                  <TooltipContent>{FORMATS}</TooltipContent>
                </Tooltip>
              )
              : <button type="button" className={tileClass} onClick={() => void openDraft("fichier")}><TileBody icon={IconFile} title="Fichier" /></button>
          )}
        </div>
      )}
      {inEditor && status.ocr && status.files && <p className="max-w-prose text-sm text-muted-foreground">Pour remplir le titre, la matière, le type et le chapitre, le nom du fichier et le début de son texte passent par le service d’IA : évite d’y laisser des données personnelles.</p>}
      {inEditor && (
        <Button variant="ghost" size="sm" className="w-fit text-muted-foreground" onClick={() => { onStarted?.(); target?.addBlocks(markdownToBlocks(courseTemplate(category))); }}>Partir d’un modèle</Button>
      )}
      {picker && (
        <SourcePicker provider={picker} open onOpenChange={(open) => { if (!open) setPicker(null); }} returnTo={`/editer/${documentId}?depart=${picker}`}
          onPick={(page) => { const provider = picker; setPicker(null); onStarted?.(); void importSource(documentId, provider, page); }} />
      )}
      {dragging && createPortal(
        <div aria-hidden="true" className="pointer-events-none fixed inset-3 z-(--z-overlay) grid place-items-center rounded-2xl border-2 border-dashed border-ring bg-background/85">
          <span className="flex items-center gap-2 text-lg font-semibold"><Icon icon={IconCloudUpload} size={24} />Dépose ton fichier</span>
        </div>,
        document.body,
      )}
    </section>
  );
}
