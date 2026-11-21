"use client";

import { useState } from "react";
import { AiButton } from "@/components/ai/ai-button";
import { AiWorking } from "@/components/ai/ai-working";
import { Attest, AttestReminder } from "@/components/attest";
import { Icon } from "@/components/icon";
import { Sortable, SortableItem, SortableItemHandle } from "@/components/reui/sortable";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AI_NOTICE } from "@/lib/ai-ui";
import { IconAdd, IconAiScan, IconClose, IconDone, IconError, IconRefresh } from "@/lib/icons";
import { dismissJob, type ImportJob, movePages, removePage, startPhotos } from "./import-jobs";
import { MAX_PAGES } from "./photo-pages";

const pagesLabel = (n: number) => (n === 1 ? "1 page" : `${n} pages`);

/** Vignettes dans l'ordre d'envoi : on les déplace (glisser, ou clavier par Espace puis flèches) et on les retire. */
function Thumbnails({ documentId, job, onAdd }: { documentId: string; job: ImportJob; onAdd: (files: File[]) => void }) {
  const busy = job.phase === "running";
  const first = job.pages[0]?.id;
  return (
    <Sortable value={job.pages} onValueChange={(pages) => movePages(documentId, pages)} getItemValue={(page) => String(page.id)} strategy="horizontal"
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pt-1 pb-2" aria-label="Pages à transcrire">
      {job.pages.map((page, index) => (
        <SortableItem key={page.id} value={String(page.id)} disabled={busy && page.id === first} className="relative shrink-0">
          <SortableItemHandle cursor={!(busy && page.id === first)} className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={page.thumb} alt={`Page ${job.done + index + 1}`} draggable={false}
              className="h-20 w-15 rounded-md object-cover shadow-xs data-[current]:opacity-60" data-current={busy && page.id === first ? "" : undefined} />
          </SortableItemHandle>
          <span className="pointer-events-none absolute bottom-1 left-1 rounded-sm bg-background/90 px-1 text-xs font-semibold tabular-nums">{job.done + index + 1}</span>
          {!(busy && page.id === first) && (
            <button type="button" aria-label={`Retirer la page ${job.done + index + 1}`} onClick={() => removePage(documentId, page.id)}
              className="absolute -top-1 -right-1 flex size-6 items-center justify-center rounded-full bg-background text-muted-foreground shadow-xs after:absolute after:-inset-2 hover:text-foreground">
              <Icon icon={IconClose} size={16} className="size-3.5" />
            </button>
          )}
        </SortableItem>
      ))}
      {job.total < MAX_PAGES && (
        <label className="flex h-20 w-15 shrink-0 cursor-pointer items-center justify-center rounded-md border border-dashed border-input text-muted-foreground transition-colors hover:text-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/40">
          <Icon icon={IconAdd} label="Ajouter des pages" />
          <input type="file" accept="image/*,application/pdf" capture="environment" multiple className="sr-only" onChange={(event) => { onAdd([...(event.target.files ?? [])]); event.target.value = ""; }} />
        </label>
      )}
    </Sortable>
  );
}

/** L'import en cours d'un brouillon, à la place des tuiles. */
export function ImportProgress({ documentId, job, accepted, onAdd }: { documentId: string; job: ImportJob; accepted: boolean; onAdd: (files: File[]) => void }) {
  const [attested, setAttested] = useState(false);
  const [missing, setMissing] = useState(false);

  if (job.phase === "error") {
    return (
      <div role="alert" className="grid gap-3 rounded-xl bg-card p-4 shadow-xs motion-ok:animate-rise">
        <p className="flex items-start gap-2 text-sm"><Icon icon={IconError} className="mt-0.5 shrink-0 text-destructive" />{job.error}</p>
        {job.kind === "photo" && job.pages.length > 0 && <Thumbnails documentId={documentId} job={job} onAdd={onAdd} />}
        <div className="flex flex-wrap gap-2">
          {job.kind === "photo" && job.pages.length > 0 && job.left !== 0 && <Button variant="outline" size="sm" onClick={() => startPhotos(documentId)}><Icon icon={IconRefresh} size={16} />Réessayer</Button>}
          <Button variant="ghost" size="sm" onClick={() => dismissJob(documentId)}>Fermer</Button>
        </div>
      </div>
    );
  }

  if (job.phase === "done") {
    return (
      <p role="status" className="ai-border ai-surface flex flex-wrap items-center gap-x-3 gap-y-1 py-2 pr-2 pl-4 text-sm motion-ok:animate-rise">
        <Icon icon={IconDone} size={16} className="text-success" />
        <span className="font-semibold">{`${pagesLabel(job.done)} ${job.done === 1 ? "transcrite" : "transcrites"}`}</span>
        <span className="text-muted-foreground">{AI_NOTICE}</span>
        <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={() => dismissJob(documentId)}><Icon icon={IconClose} label="Fermer" /></Button>
      </p>
    );
  }

  if (job.kind !== "photo") {
    return (
      <p role="status" className="flex min-h-18 items-center gap-3 rounded-xl bg-card px-4 text-sm shadow-xs motion-ok:animate-rise">
        <Spinner className="size-5 text-brand-text" />{job.label}
      </p>
    );
  }

  if (job.phase === "attest") {
    const go = () => {
      if (!attested) return setMissing(true);
      startPhotos(documentId);
    };
    return (
      <section aria-label="Photo ou PDF avec Campuss IA" className="ai-border ai-surface grid gap-4 p-4 motion-ok:animate-rise">
        <Thumbnails documentId={documentId} job={job} onAdd={onAdd} />
        {accepted ? <AttestReminder kind="ocr" /> : <Attest kind="ocr" name="attest-ocr" checked={attested} onChange={(value) => { setAttested(value); setMissing(false); }} />}
        {missing && <p className="flex items-center gap-1.5 text-sm text-destructive"><Icon icon={IconError} size={16} />Coche l’engagement pour lancer la transcription</p>}
        <div className="flex flex-wrap items-center gap-3">
          <AiButton icon={IconAiScan} onClick={go}>{`Transcrire ${pagesLabel(job.pages.length)}`}</AiButton>
          {job.left !== null && <span className="text-sm text-muted-foreground tabular-nums">{job.left} {job.left === 1 ? "page possible" : "pages possibles"} aujourd’hui</span>}
        </div>
      </section>
    );
  }

  const current = Math.min(job.done + 1, job.total);
  return (
    <section aria-label="Transcription en cours" className="grid gap-2 motion-ok:animate-rise">
      <AiWorking label={`Campuss IA transcrit… page ${current} sur ${job.total}`} />
      {job.pages.length > 1 && <Thumbnails documentId={documentId} job={job} onAdd={onAdd} />}
      <p className="text-xs text-muted-foreground">{AI_NOTICE}</p>
    </section>
  );
}
