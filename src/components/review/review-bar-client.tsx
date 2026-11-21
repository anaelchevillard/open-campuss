"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { decideAfterPublication, decideDocument, decideRevision, markReviewedNow, undoReviewDecision, type QueueResult } from "@/app/actions/moderation";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { toastError, toastUndo } from "@/lib/toast";
import { ReasonPanel } from "./reason-panel";

const ATTEST_KEY = "campuss-attest-publish";
const ATTEST_MS = 12 * 3_600_000;
const noop = () => () => undefined;

type Props = {
  mode: "validate" | "post" | "revision"; targetId: string; documentId: string; title: string; shortcuts: boolean;
  blockedReason?: number; attestText?: string; removable?: boolean;
};

/**
 * Barre « Relecture » collée en bas de la page d'un cours, au-dessus de la barre de lecture au téléphone. Mêmes touches que la
 * file (A, R, 1–7, Entrée, Z). Rendue dans `body` : `.doc-shell` est un conteneur de requêtes, un `fixed` y serait piégé.
 */
export function ReviewBarClient({ mode, targetId, documentId, title, shortcuts, blockedReason, attestText, removable = true }: Props) {
  const router = useRouter();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState<number | null>(null);
  const [word, setWord] = useState("");
  const [attesting, setAttesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [decided, setDecided] = useState(false);
  const wordRef = useRef<HTMLInputElement>(null);
  const labels = mode === "validate" ? { accept: "Publier", reject: "Renvoyer", accepted: "Publié", rejected: "Renvoyé" }
    : mode === "post" ? { accept: "Marquer comme relu", reject: "Retirer", accepted: "Relu", rejected: "Retiré" }
      : { accept: "Accepter la correction", reject: "Refuser", accepted: "Correction acceptée", rejected: "Correction refusée" };
  const canReject = mode !== "post" || removable;

  const run = useCallback(async (decision: "accept" | "reject", chosen?: number, text?: string) => {
    setBusy(true);
    let result: QueueResult;
    if (mode === "validate") result = await decideDocument(targetId, decision === "accept" ? "publish" : "reject", { reason: chosen, word: text, attest: true });
    else if (mode === "post") result = decision === "accept" ? await markReviewedNow(targetId) : await decideAfterPublication(targetId, "remove", { reason: chosen, word: text });
    else result = await decideRevision(targetId, decision === "accept" ? "accept" : "reject", { reason: chosen, word: text });
    setBusy(false);
    if ("error" in result) { toastError(result.error); return; }
    setRejecting(false);
    setDecided(true);
    const undo = () => void undoReviewDecision(targetId).then((r) => { if ("error" in r) toastError(r.error); else { setDecided(false); router.refresh(); } });
    toastUndo(`${decision === "accept" ? labels.accepted : labels.rejected} · ${title.trim() || "Sans titre"}`, undo);
    router.refresh();
  }, [mode, targetId, title, labels.accepted, labels.rejected, router]);

  const accept = useCallback(() => {
    if (blockedReason) { setRejecting(true); setReason(blockedReason); return; }
    if (mode === "validate") {
      let ok = false;
      try { ok = Date.now() - Number(localStorage.getItem(ATTEST_KEY) ?? 0) < ATTEST_MS; } catch { /* stockage indisponible */ }
      if (!ok) { setAttesting(true); return; }
    }
    void run("accept");
  }, [blockedReason, mode, run]);
  const confirmReject = useCallback(() => { if (!reason) { toastError("Choisis un motif"); return; } void run("reject", reason, word); }, [reason, word, run]);

  useEffect(() => {
    if (!shortcuts || decided) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || attesting) return;
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true]")) return;
      const k = event.key.toLowerCase();
      if (rejecting && /^[1-7]$/.test(k)) setReason(Number(k));
      else if (rejecting && k === "enter") confirmReject();
      else if (rejecting && k === "escape") setRejecting(false);
      else if (k === "a") accept();
      else if (k === "r" && canReject) setRejecting(true);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts, decided, attesting, rejecting, confirmReject, accept, canReject]);

  if (!mounted || decided) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-offset)+0.5rem)] z-(--z-sticky) flex justify-center px-3 lg:pl-[var(--sidebar-width,0px)]" data-review-bar={documentId}>
      <div role="region" aria-label="Relecture" className="pointer-events-auto grid w-full max-w-[44rem] gap-3 rounded-2xl bg-popover p-2 shadow-md motion-ok:animate-rise">
        {rejecting && <ReasonPanel reason={reason} onReason={setReason} word={word} onWord={setWord} onSubmit={confirmReject} onClose={() => setRejecting(false)} submitLabel={labels.reject} shortcuts={shortcuts} wordRef={wordRef} />}
        <div className="flex items-center gap-2">
          <span className="px-2 text-sm font-semibold text-muted-foreground">Relecture</span>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {canReject && <Button variant="outline" aria-expanded={rejecting} onClick={() => setRejecting((v) => !v)}>{labels.reject}{shortcuts && <Kbd className="coarse:hidden">R</Kbd>}</Button>}
            <Button pending={busy} onClick={accept}>{labels.accept}{shortcuts && <Kbd className="bg-white/15 text-primary-foreground coarse:hidden">A</Kbd>}</Button>
          </div>
        </div>
      </div>
      <ResponsiveSheet open={attesting} onOpenChange={setAttesting} title="Avant de publier" size="sm"
        footer={<Button onClick={() => { try { localStorage.setItem(ATTEST_KEY, String(Date.now())); } catch { /* stockage indisponible */ } setAttesting(false); void run("accept"); }}>J’ai vérifié, publier</Button>}>
        <p className="pb-2 text-pretty">{attestText}</p>
        <p className="pb-2 text-sm text-muted-foreground">Demandé une fois par séance de relecture</p>
      </ResponsiveSheet>
    </div>,
    document.body,
  );
}
