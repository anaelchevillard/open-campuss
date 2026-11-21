import { Icon } from "@/components/icon";
import { Badge } from "@/components/reui/badge";
import { ROLE_LABELS, STATUS_LABELS } from "@/lib/admin-actions";
import type { DomainVerdict } from "@/lib/domains";
import { IconDomainOk, IconError, IconPending, IconSuccess, IconSuspend, IconWarning, type IconData } from "@/lib/icons";

type Variant = "success-light" | "warning-light" | "info-light" | "destructive-light" | "secondary" | "primary-light";

/** Badge de domaine d'une demande : vérifié, ressemblant (attention) ou autre. Toujours couleur + icône + mot. */
export function DomainBadge({ verdict }: { verdict: DomainVerdict }) {
  if (verdict.kind === "verified") return <Badge variant="success-light" size="lg"><Icon icon={IconDomainOk} size={16} />Domaine étudiant</Badge>;
  if (verdict.kind === "lookalike") return <Badge variant="warning-light" size="lg"><Icon icon={IconWarning} size={16} />Ressemble à {verdict.like}</Badge>;
  return <Badge variant="secondary" size="lg">Autre</Badge>;
}

const PERSON: Record<string, [Variant, IconData]> = {
  active: ["success-light", IconSuccess], pending: ["info-light", IconPending], unverified: ["secondary", IconPending],
  rejected: ["secondary", IconError], disabled: ["destructive-light", IconError], banned: ["destructive-light", IconError],
};

/** État d'un compte : suspendu et suppression programmée passent avant le statut. */
export function PersonStatus({ status, suspended, deletion }: { status: string; suspended?: boolean; deletion?: boolean }) {
  if (deletion) return <Badge variant="destructive-light" size="lg"><Icon icon={IconError} size={16} />Suppression programmée</Badge>;
  if (suspended) return <Badge variant="warning-light" size="lg"><Icon icon={IconSuspend} size={16} />Suspendu</Badge>;
  const [variant, icon] = PERSON[status] ?? PERSON.unverified;
  return <Badge variant={variant} size="lg"><Icon icon={icon} size={16} />{STATUS_LABELS[status] ?? status}</Badge>;
}

export const roleLabel = (role: string, owner?: boolean) => (owner ? "Propriétaire" : ROLE_LABELS[role] ?? role);

const FMT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });
const FMT_TIME = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
export const shortDate = (d: Date | string | null | undefined) => (d ? FMT.format(new Date(d)) : "—");
export const dateTime = (d: Date | string | null | undefined) => (d ? FMT_TIME.format(new Date(d)) : "—");

/** Heure du rendu serveur, transmise aux grilles clientes pour que `ago` donne le même texte à l'hydratation. */
export const renderedAt = () => Date.now();

/**
 * « il y a 3 j » : ce qui compte dans une grille, c'est l'ancienneté. Un composant client reçoit `now` du serveur :
 * sinon le rendu serveur et l'hydratation tombent de part et d'autre d'une minute (erreur React #418).
 */
export function ago(d: Date | string | null | undefined, now: number = Date.now()) {
  if (!d) return "Jamais";
  const ms = now - new Date(d).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 60) return min <= 1 ? "à l’instant" : `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.round(h / 24);
  if (days < 60) return `il y a ${days} j`;
  return shortDate(d);
}
