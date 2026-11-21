"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "cn";
import { startDraft } from "@/app/actions/connected";
import { Icon } from "@/components/icon";
import { IconAiScan, IconUpload } from "@/lib/icons";
import { keepPendingFiles } from "@/lib/pending-files";
import { toastError } from "@/lib/toast";

/** Attend que la feuille ait rendu son entrée d'historique avant de naviguer : sinon son retour annulerait la navigation. */
function afterSheetClosed(go: () => void) {
  let done = false;
  const run = () => { if (done) return; done = true; window.removeEventListener("popstate", run); go(); };
  window.addEventListener("popstate", run);
  window.setTimeout(run, 250);
}

/**
 * « Photo ou PDF avec Campuss IA » dans « Commencer avec… ». Le geste de l'étudiant ouvre l'appareil photo ;
 * le brouillon se crée ensuite, les photos le suivent en mémoire et la transcription démarre sur sa page.
 * L'appelant ne la monte que si l'IA est disponible.
 */
export function PhotoEntry({ subjectId, variant = "sheet", onNavigate }: { subjectId?: number; variant?: "sheet" | "tile"; onNavigate?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function take(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    keepPendingFiles(files);
    const created = await startDraft(subjectId ?? null).catch(() => ({ error: "Le brouillon n’a pas pu être créé. Réessaie." }));
    setBusy(false);
    if ("error" in created) return toastError(created.error);
    const href = `/editer/${created.id}?depart=photo`;
    if (onNavigate) { onNavigate(); afterSheetClosed(() => router.push(href)); } else router.push(href);
  }

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; void take(files); };

  return (
    <div className="grid gap-1">
      <label data-animate="" data-busy={busy ? "" : undefined} aria-busy={busy || undefined}
        className={cn("ai-border ai-glow group flex cursor-pointer items-center gap-4 rounded-2xl p-4 outline-none has-focus-visible:ring-3 has-focus-visible:ring-ring/40", variant === "sheet" ? "min-h-24" : "min-h-28")}>
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--ai-3)_10%,var(--card))] text-[var(--ai-3)]"><Icon icon={IconAiScan} size={24} className="ai-spark" /></span>
        <span className="grid gap-0.5">
          <span className={cn("text-base font-semibold", busy ? "ai-text-shimmer" : "ai-text")}>Photo ou PDF avec Campuss IA</span>
          <span className="text-sm text-muted-foreground">Tes notes deviennent un cours à relire</span>
        </span>
        {/* capture : au téléphone, un toucher ouvre directement l'appareil photo */}
        <input type="file" accept="image/*,application/pdf" capture="environment" multiple disabled={busy} aria-label="Prendre une photo ou choisir un PDF" className="sr-only" onChange={onChange} />
      </label>
      <label className="hidden min-h-11 w-fit cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-semibold text-link coarse:inline-flex">
        <Icon icon={IconUpload} size={16} />Choisir un fichier
        <input type="file" accept="image/*,application/pdf" multiple disabled={busy} className="sr-only" onChange={onChange} />
      </label>
    </div>
  );
}
