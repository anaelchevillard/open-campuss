import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "cn";
import { RatingSummary } from "@/components/doc-rating";
import { FavoriteStar } from "@/components/favorite-star";
import { StatusBadge, type DocStatus } from "@/components/status-badge";
import { Badge } from "@/components/reui/badge";
import { CATEGORY_TAGS } from "@/lib/db/categories";
import { yearLabel } from "@/lib/doc-facets";
import { chapterLabel } from "@/lib/roman";
import { coverHue, subjectSigle } from "@/lib/subject-cover";

export type DocCardDoc = {
  id: string; title: string; category: keyof typeof CATEGORY_TAGS; chapter: number | null; semester: number | null; coverFileId: string | null; published?: boolean; reviewRequested?: boolean;
  academicYear?: string; teacherName?: string; updatedAt?: Date; reviewedAt?: Date | null; ratingAvg?: number | null; ratingCount?: number; readers?: number;
  /** Pour la couverture de remplacement : la teinte vient de la matière, le sigle de son nom court */
  subjectId?: number | null; subjectShort?: string | null;
};

// Pas de lib/documents ici (server-only) : la carte sert aussi dans des composants client
const formatDate = (date: Date) => date.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });

/**
 * La carte de cours (effet carte gardé) : une couverture seulement si elle existe, le titre, une ligne de faits, deux badges au plus.
 * `favorite` affiche l'étoile ; `status` l'état le plus important ; `footer` les chiffres de Mes documents.
 */
export function DocCard({ doc, meta, status, favorite, variant = "grid", footer, href, divider = true }: { doc: DocCardDoc; meta?: string; status?: DocStatus; favorite?: boolean; variant?: "grid" | "row"; footer?: ReactNode; href?: string; divider?: boolean }) {
  // Le chapitre est une pastille (sur la couverture, ou en tête de carte sans couverture), plus dans la ligne de faits
  const chapter = chapterLabel(doc.chapter);
  const facts = [meta, doc.teacherName, doc.semester ? `S${doc.semester}` : "", doc.academicYear ? yearLabel(doc.academicYear) : ""].filter(Boolean).join(" · ");
  const row = variant === "row";
  return (
    <article className={cn(
      "group relative flex h-full overflow-hidden rounded-xl bg-card shadow-xs transition-[box-shadow,translate,scale] duration-(--dur-base) ease-out hover-ok:shadow-sm motion-ok:hover-ok:-translate-y-0.5 motion-ok:active:scale-[.985] motion-ok:active:duration-(--dur-instant)",
      row ? "flex-row items-center" : "flex-col",
    )}>
      {/* Toutes les cartes de la grille ont une couverture à la même hauteur : l'image, sinon celle de la matière */}
      {!row && (
        <div className="relative aspect-[16/7] overflow-hidden rounded-t-xl">
          {doc.coverFileId ? (
            <>
              {/* Sur une image : fond voilé et flouté, lisible sur n'importe quelle photo */}
              {chapter && <ChapterPill label={chapter} className="absolute top-2 left-2 z-10 bg-black/45 text-white ring-1 ring-white/20 backdrop-blur-md" />}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/files/${doc.coverFileId}?inline=1`} alt="" loading="lazy" className="size-full object-cover transition-transform duration-(--dur-slow) ease-out motion-ok:group-hover:scale-[1.03]" />
            </>
          ) : (
            <>
              {chapter && <ChapterPill label={chapter} className="absolute top-2 left-2 z-10 bg-card text-foreground shadow-xs" />}
              <SubjectCover hue={coverHue(doc.subjectId, doc.id)} sigle={subjectSigle(doc.subjectShort) || CATEGORY_TAGS[doc.category]} />
            </>
          )}
        </div>
      )}
      <div className={cn("flex min-w-0 flex-1 flex-col gap-1.5 p-4", favorite !== undefined && "pr-12", row && "py-3")}>
        {chapter && row && <ChapterPill label={chapter} className="self-start bg-secondary text-secondary-foreground" />}
        <h3 className="card-title line-clamp-2 font-sans text-base leading-snug font-semibold" style={{ viewTransitionName: `doc-${doc.id}` }}>
          <Link href={href ?? `/d/${doc.id}`} className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50">{doc.title.trim() || "Sans titre"}</Link>
        </h3>
        {facts && <p className="truncate text-sm text-muted-foreground">{facts}</p>}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground empty:hidden">
          <RatingSummary average={doc.ratingAvg ?? null} count={doc.ratingCount ?? 0} className="text-sm" />
          {Boolean(doc.readers) && <span className="tabular-nums">{doc.readers} lecteur{doc.readers! > 1 ? "s" : ""}</span>}
          {doc.updatedAt && !row && <span>Mis à jour le {formatDate(doc.updatedAt)}</span>}
        </p>
        <div className={cn("flex flex-wrap items-center gap-1.5", !row && (footer ? "pt-1 pb-1" : "mt-auto pt-1"))}>
          <Badge variant="primary-light" size="lg" radius="full">{CATEGORY_TAGS[doc.category]}</Badge>
          {status && <StatusBadge status={status} />}
        </div>
        {/* Le pied (hauteur variable) descend en bas : les pastilles d'état restent alignées d'une carte à l'autre */}
        {footer && <div className={cn("relative z-10 text-sm", !row && "mt-auto", divider ? "border-t border-border pt-2" : "pt-1.5")}>{footer}</div>}
      </div>
      {favorite !== undefined && <FavoriteStar docId={doc.id} initial={favorite} title={doc.title} className="absolute top-1 right-1" />}
    </article>
  );
}

/** Même dimensions que la carte, pendant le chargement. */
export function DocCardSkeleton() {
  return (
    <div aria-hidden className="flex h-full flex-col gap-2 overflow-hidden rounded-xl bg-card pb-4 shadow-xs">
      <span className="mb-2 aspect-[16/7] animate-pulse bg-muted" />
      <span className="mx-4 h-4 w-4/5 animate-pulse rounded-sm bg-muted" />
      <span className="mx-4 h-4 w-2/5 animate-pulse rounded-sm bg-muted" />
      <span className="mx-4 mt-4 h-5 w-12 animate-pulse rounded-full bg-muted" />
    </div>
  );
}

/** Grille par requête de conteneur : 1 colonne sous 30rem, 2 sous 52rem, 3 au-delà. */
export function DocGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="@container">
      <ul className={cn("stagger grid gap-3 @[30rem]:grid-cols-2 @[52rem]:grid-cols-3", className)}>{children}</ul>
    </div>
  );
}

/**
 * Couverture d'un cours sans image : dégradé sobre dans la teinte de la matière, trame de points discrète,
 * sigle de la matière. Même hauteur qu'une image : les cartes restent alignées.
 */
function SubjectCover({ hue, sigle }: { hue: number; sigle: string }) {
  return (
    <div aria-hidden className="subject-cover flex size-full items-end p-4" style={{ "--cover-h": hue } as CSSProperties}>
      <span className="font-heading text-3xl leading-none font-semibold tracking-tight">{sigle}</span>
    </div>
  );
}

/**
 * Vignette d'un cours dans une liste (administration…) : l'image, sinon la couverture de la matière en petit.
 * Mêmes teintes et même sigle que la carte : on reconnaît le cours d'une vue à l'autre.
 */
export function DocThumb({ doc, className }: { doc: Pick<DocCardDoc, "id" | "category" | "coverFileId" | "subjectId" | "subjectShort">; className?: string }) {
  return (
    <span aria-hidden className={cn("block aspect-[4/3] w-16 shrink-0 overflow-hidden rounded-md", className)}>
      {doc.coverFileId
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={`/files/${doc.coverFileId}?inline=1`} alt="" loading="lazy" className="size-full object-cover" />
        : <span className="subject-cover flex size-full items-end p-1.5" style={{ "--cover-h": coverHue(doc.subjectId, doc.id) } as CSSProperties}>
          <span className="font-heading text-sm leading-none font-semibold tracking-tight">{subjectSigle(doc.subjectShort) || CATEGORY_TAGS[doc.category]}</span>
        </span>}
    </span>
  );
}

/** Pastille du chapitre (« CHAP. II ») : voilée et floutée sur une image, pleine ailleurs ; lisible en clair comme en sombre. */
export function ChapterPill({ label, className }: { label: string; className?: string }) {
  return <span className={cn("pointer-events-none inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide tabular-nums", className)}>{label}</span>;
}
