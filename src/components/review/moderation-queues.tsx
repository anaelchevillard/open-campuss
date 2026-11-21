"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { decideAfterPublication, decideDocument, decideMemoCard, decideRevision, undoReviewDecision } from "@/app/actions/moderation";
import { regenerateDeckNow } from "@/app/actions/quality";
import { EmptyState } from "@/components/empty-state";
import { ReviewQueue, type QueueItem } from "@/components/review/review-queue";
import { IconAiCards, IconPublished, IconRefresh, IconRevisionPending, IconTodo } from "@/lib/icons";
import { toast, toastError } from "@/lib/toast";

export type DocItem = QueueItem & { authorId: string | null; authorName: string };
export type CardItem = QueueItem & { documentId: string; cardKey: string };

type Common = { previews: Record<string, ReactNode>; shortcuts: boolean };

/** À valider : Publier (A) ou Renvoyer avec un motif (R, 1–7). L'origine inconnue présélectionne « Origine à préciser ». */
export function ValidateQueue({ items, previews, shortcuts, attestText }: Common & { items: DocItem[]; attestText: string }) {
  return (
    <ReviewQueue items={items} label="À valider" shortcuts={shortcuts} renderPreview={(item) => previews[item.id]} openHref={(item) => `/d/${item.id}`}
      attest={{ key: "campuss-attest-publish", text: attestText }}
      onDecision={(item, decision, reason, word) => decideDocument(item.id, decision === "accept" ? "publish" : "reject", { reason, word, attest: true })}
      onUndo={(item) => undoReviewDecision(item.id).then((r) => { if ("error" in r) toastError(r.error); })}
      empty={<EmptyState icon={IconTodo} title="Tout est validé" />} />
  );
}

/**
 * Après coup : un cours mis en ligne avant la règle « toujours relu avant publication » (ancienne publication directe
 * des auteurs de confiance) et pas encore relu. Garder (A) ou Retirer (R).
 */
export function AfterQueue({ items, previews, shortcuts }: Common & { items: DocItem[] }) {
  return (
    <ReviewQueue items={items} label="Après coup" shortcuts={shortcuts} renderPreview={(item) => previews[item.id]} openHref={(item) => `/d/${item.id}`}
      acceptLabel="Garder" rejectLabel="Retirer" acceptDone="Gardé" rejectDone="Retiré"
      onDecision={(item, decision, reason, word) => decideAfterPublication(item.id, decision === "accept" ? "keep" : "remove", { reason, word })}
      onUndo={(item) => undoReviewDecision(item.id).then((r) => { if ("error" in r) toastError(r.error); })}
      empty={<EmptyState icon={IconPublished} title="Rien à relire après coup" />} />
  );
}

/** Corrections : le texte est comparé au mot, dans la colonne de lecture. */
export function RevisionQueue({ items, previews, shortcuts }: Common & { items: (QueueItem & { documentId: string })[] }) {
  return (
    <ReviewQueue items={items} label="Corrections" shortcuts={shortcuts} renderPreview={(item) => previews[item.id]} openHref={(item) => `/d/${item.documentId}`}
      acceptLabel="Accepter" rejectLabel="Refuser" acceptDone="Acceptée" rejectDone="Refusée"
      onDecision={(item, decision, reason, word) => decideRevision(item.id, decision === "accept" ? "accept" : "reject", { reason, word })}
      onUndo={(item) => undoReviewDecision(item.id).then((r) => { if ("error" in r) toastError(r.error); })}
      empty={<EmptyState icon={IconRevisionPending} title="Aucune correction en attente" />} />
  );
}

/** Fiches IA signalées : Garder (A) ou Retirer (R), sans motif ; Régénérer le paquet dans « … » quand l'IA est active. */
export function CardQueue({ items, previews, shortcuts, ai }: Common & { items: CardItem[]; ai: boolean }) {
  const router = useRouter();
  return (
    <ReviewQueue items={items} label="Fiches IA" shortcuts={shortcuts} renderPreview={(item) => previews[item.id]} openHref={(item) => `/d/${item.documentId}#fiches-memo`}
      acceptLabel="Garder" rejectLabel="Retirer" acceptDone="Gardée" rejectDone="Retirée" reasons={false}
      menu={ai ? (item) => [{ label: "Régénérer tout le paquet", icon: IconRefresh, onSelect: () => void regenerateDeckNow(item.documentId).then((r) => { if (r.error) toastError(r.error); else { toast(r.ok ?? "Paquet régénéré"); router.refresh(); } }) }] : undefined}
      onDecision={(item, decision) => decideMemoCard(item.documentId, item.cardKey, decision === "accept" ? "keep" : "remove")}
      onUndo={(item) => undoReviewDecision(`${item.documentId}:${item.cardKey}`).then((r) => { if ("error" in r) toastError(r.error); })}
      empty={<EmptyState icon={IconAiCards} title="Aucune fiche signalée" />} />
  );
}
