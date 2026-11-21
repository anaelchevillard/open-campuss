import { cn } from "cn";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/reui/badge";
import { IconDelete, IconDraft, IconHiddenByReports, IconPending, IconPublished, IconRevisionPending, IconToFix, type IconData } from "@/lib/icons";

/** Les 7 statuts d'un document (DESIGN.md §4.4) et le filtre Corbeille. Toujours couleur + icône + mot. */
export type DocStatus = "draft" | "tofix" | "pending" | "published" | "postreview" | "revision" | "hidden" | "trash";

const STATUS: Record<DocStatus, { label: string; variant: "secondary" | "warning-light" | "info-light" | "success-light" | "success-outline" | "primary-light" | "destructive-light"; icon: IconData }> = {
  draft: { label: "Brouillon", variant: "secondary", icon: IconDraft },
  tofix: { label: "À corriger", variant: "warning-light", icon: IconToFix },
  pending: { label: "En attente", variant: "info-light", icon: IconPending },
  published: { label: "Publié", variant: "success-light", icon: IconPublished },
  postreview: { label: "Publié, relecture à venir", variant: "success-outline", icon: IconPublished },
  revision: { label: "Correction proposée", variant: "primary-light", icon: IconRevisionPending },
  hidden: { label: "Masqué", variant: "destructive-light", icon: IconHiddenByReports },
  trash: { label: "Corbeille", variant: "secondary", icon: IconDelete },
};

export const STATUS_LABELS = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.label])) as Record<DocStatus, string>;

/** Le statut le plus important d'un document, selon ses colonnes. */
export function statusOf(doc: { published?: boolean | null; reviewRequested?: boolean | null; reviewNote?: string | null; postReviewAt?: Date | null; hiddenByReports?: boolean | null; deletedAt?: Date | null }, pendingRevision = false): DocStatus {
  if (doc.deletedAt) return "trash";
  if (doc.hiddenByReports) return "hidden";
  if (pendingRevision) return "revision";
  if (doc.published) return doc.postReviewAt ? "postreview" : "published";
  if (doc.reviewRequested) return "pending";
  return doc.reviewNote ? "tofix" : "draft";
}

export function StatusBadge({ status, className, size = "lg" }: { status: DocStatus; className?: string; size?: "sm" | "default" | "lg" }) {
  const s = STATUS[status];
  return <Badge variant={s.variant} size={size} radius="full" className={cn("gap-1 pr-2", className)}><Icon icon={s.icon} size={16} className="size-3.5" />{s.label}</Badge>;
}
