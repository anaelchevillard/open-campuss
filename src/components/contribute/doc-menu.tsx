"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { duplicateMine, purgeMine, restoreMine, trashMine, undoUnpublish, unpublishMine } from "@/app/actions/documents";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { WithdrawalDialog } from "@/components/contribute/withdrawal-dialog";
import { Icon } from "@/components/icon";
import { ResponsiveMenu, type MenuEntry } from "@/components/responsive-menu";
import { Button } from "@/components/ui/button";
import type { DocStatus } from "@/components/status-badge";
import { IconCopy, IconDelete, IconEdit, IconEye, IconHidden, IconLink, IconMore, IconRestore, IconStats } from "@/lib/icons";
import type { MyDoc } from "@/lib/my-documents";
import { toast, toastError, toastUndo } from "@/lib/toast";

/**
 * Où mène un document : sa page de lecture dès qu'il a été envoyé (en relecture, à corriger, publié : l'auteur le lit
 * comme un cours publié), l'éditeur pour un brouillon, ou la fiche d'administration pour un import.
 */
export function hrefOf(doc: Pick<MyDoc, "id" | "published" | "kind" | "status">) {
  if (doc.published || (doc.kind === "editor" && doc.status !== "draft" && doc.status !== "trash")) return `/d/${doc.id}`;
  return doc.kind === "editor" ? `/editer/${doc.id}` : `/admin/documents/${doc.id}`;
}

type Patch = (id: string, status: DocStatus | null) => void;

/**
 * Les actions rapides d'un document. Ce qui se défait part tout de suite avec « Annuler » ; seule la suppression définitive
 * (depuis la corbeille) demande une confirmation.
 */
export function useDocActions({ patch, openSheet, withdrawDirectly }: { patch: Patch; openSheet: (id: string) => void; withdrawDirectly: boolean }) {
  const router = useRouter();
  const [purging, setPurging] = useState<MyDoc | null>(null);
  const [withdrawing, setWithdrawing] = useState<MyDoc | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<{ ok: true; id?: string } | { error: string }>, onOk?: (result: { ok: true; id?: string }) => void) => {
    const result = await fn();
    if ("error" in result) { toastError(result.error); router.refresh(); return; }
    onOk?.(result);
    router.refresh();
  };

  const entries = (doc: MyDoc): MenuEntry[] => {
    if (doc.status === "trash") return [
      { label: "Restaurer", icon: IconRestore, onSelect: () => { patch(doc.id, null); void run(() => restoreMine(doc.id), () => toast("Document restauré")); } },
      { label: "Supprimer définitivement", icon: IconDelete, danger: true, separatorBefore: true, onSelect: () => setPurging(doc) },
    ];
    const link = `${typeof window === "undefined" ? "" : window.location.origin}/d/${doc.id}`;
    return [
      { label: "Ouvrir", icon: IconEye, href: hrefOf(doc) },
      ...(doc.kind === "editor" ? [{ label: "Modifier", icon: IconEdit, href: `/editer/${doc.id}` }] : []),
      { label: "Statistiques et fil", icon: IconStats, onSelect: () => openSheet(doc.id) },
      ...(doc.published ? [{ label: "Copier le lien", icon: IconLink, onSelect: () => { void navigator.clipboard?.writeText(link).then(() => toast("Lien copié"), () => toastError("Copie impossible")); } }] : []),
      ...(doc.kind === "editor" ? [{ label: "Dupliquer", icon: IconCopy, onSelect: () => void run(() => duplicateMine(doc.id), () => toast("Copie créée dans les brouillons")) }] : []),
      // Un cours publié par un étudiant ne se retire que sur demande à l'administration
      ...(doc.published && !withdrawDirectly ? [{ label: "Demander le retrait", icon: IconHidden, separatorBefore: true, onSelect: () => setWithdrawing(doc) }] : []),
      ...(doc.published && withdrawDirectly ? [{ label: "Retirer de la publication", icon: IconHidden, separatorBefore: true, onSelect: () => {
        patch(doc.id, "draft");
        void run(() => unpublishMine(doc.id), () => toastUndo("Retiré de la publication", () => { patch(doc.id, null); void run(() => undoUnpublish(doc.id)); }));
      } }] : []),
      ...(!doc.published || withdrawDirectly ? [{ label: "Mettre à la corbeille", icon: IconDelete, danger: true, separatorBefore: !doc.published, onSelect: () => {
        patch(doc.id, "trash");
        void run(() => trashMine(doc.id), () => toastUndo("Mis à la corbeille", () => { patch(doc.id, null); void run(() => restoreMine(doc.id)); }));
      } }] : []),
    ];
  };

  const confirm = (
    <>
    <WithdrawalDialog doc={withdrawing} onClose={() => setWithdrawing(null)} />
    <ConfirmDialog open={purging !== null} onOpenChange={(open) => { if (!open) setPurging(null); }} level="danger" pending={busy}
      title="Supprimer définitivement ?" description={purging ? `« ${purging.title.trim() || "Sans titre"} » et ses fichiers disparaîtront pour de bon.` : undefined}
      confirmLabel="Supprimer" onConfirm={async () => {
        if (!purging) return;
        setBusy(true);
        const doc = purging;
        patch(doc.id, "trash");
        await run(() => purgeMine(doc.id), () => toast("Supprimé définitivement"));
        setBusy(false);
        setPurging(null);
      }} />
    </>
  );
  return { entries, confirm };
}

/** Le bouton « … ». `menuRef` permet au clic droit sur la carte d'ouvrir le même menu. */
export function DocMenu({ doc, entries, menuRef, className }: { doc: MyDoc; entries: MenuEntry[]; menuRef?: React.RefObject<HTMLButtonElement | null>; className?: string }) {
  return (
    <ResponsiveMenu title={doc.title.trim() || "Sans titre"} items={entries}
      trigger={<Button ref={menuRef} variant="ghost" size="icon-sm" className={className} aria-label={`Actions pour ${doc.title.trim() || "Sans titre"}`}><Icon icon={IconMore} size={20} /></Button>} />
  );
}

/** Clic droit (ou appui long au toucher) : ouvre le menu « … » de l'élément. */
export function WithContextMenu({ children, className }: { children: (ref: React.RefObject<HTMLButtonElement | null>) => ReactNode; className?: string }) {
  const ref = useRef<HTMLButtonElement | null>(null);
  return <div className={className} onContextMenu={(event) => { if (!ref.current) return; event.preventDefault(); ref.current.click(); }}>{children(ref)}</div>;
}
