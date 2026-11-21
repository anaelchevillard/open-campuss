import Link from "next/link";
import { copyPack, revisePack } from "@/app/actions/packs";
import { ActionForm } from "@/components/action-form";
import { Icon } from "@/components/icon";
import { Submit } from "@/components/submit";
import { buttonVariants } from "@/components/ui/button";
import { IconCards, IconGoal } from "@/lib/icons";
import type { ExamPaper } from "@/lib/revise-resources";

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

export type PromoPackRow = { pack: { id: string; title: string; copies: number }; owner: string; cards: number; copied?: boolean };

/**
 * Un paquet de la promo n'est pas un cours. Sa carte dit ce qu'il est (fiches, auteur, copies)
 * et propose ses actions : Réviser (copie une fois, puis séance), Copier dans mes fiches, Voir les fiches.
 */
export function PromoPackList({ rows }: { rows: PromoPackRow[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map(({ pack, owner, cards, copied }) => (
        <li key={pack.id} className="grid min-w-0 content-between gap-3 rounded-xl bg-card p-4 shadow-xs">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-tint text-brand-text"><Icon icon={IconCards} size={20} /></span>
            <span className="grid min-w-0 gap-0.5">
              <Link href={`/reviser/fiches/paquets/${pack.id}`} className="line-clamp-2 font-semibold underline-offset-2 hover:underline">{pack.title}</Link>
              <span className="truncate text-sm text-muted-foreground tabular-nums">{plural(cards, "fiche")} · {owner} · {plural(pack.copies, "copie")}</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ActionForm action={revisePack}><input type="hidden" name="id" value={pack.id} /><Submit size="sm" variant="outline" aria-label={`Réviser ${pack.title}`}>Réviser</Submit></ActionForm>
            {copied
              ? <span className="text-sm text-muted-foreground">Dans tes fiches</span>
              : <ActionForm action={copyPack} hideOnOk><input type="hidden" name="id" value={pack.id} /><Submit size="sm" variant="ghost" aria-label={`Copier ${pack.title} dans mes fiches`}>Copier dans mes fiches</Submit></ActionForm>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Un sujet de partiel publié : une ressource pour s'entraîner (quiz du sujet s'il existe), pas un cours à lire. */
export function ExamPaperList({ papers }: { papers: ExamPaper[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {papers.map((paper) => (
        <li key={paper.id} className="grid min-w-0 content-between gap-3 rounded-xl bg-card p-4 shadow-xs">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon icon={IconGoal} size={20} /></span>
            <span className="grid min-w-0 gap-0.5">
              <Link href={`/d/${paper.id}`} className="line-clamp-2 font-semibold underline-offset-2 hover:underline">{paper.title || "Sans titre"}</Link>
              <span className="truncate text-sm text-muted-foreground">{[paper.subject, paper.academicYear].filter(Boolean).join(" · ")}</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={paper.quizReady ? `/d/${paper.id}/quiz` : `/d/${paper.id}`} data-slot="button" className={buttonVariants({ size: "sm", variant: "outline" })} aria-label={`S’entraîner sur ${paper.title || "ce sujet"}`}>S’entraîner</Link>
            {paper.quizReady && <Link href={`/d/${paper.id}`} data-slot="button" className={buttonVariants({ size: "sm", variant: "ghost" })}>Voir le sujet</Link>}
          </div>
        </li>
      ))}
    </ul>
  );
}
