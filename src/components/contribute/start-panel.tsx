import Link from "next/link";
import { Icon } from "@/components/icon";
import { PhotoEntry } from "@/components/import/photo-entry";
import { StartTiles } from "@/components/import/start-tiles";
import { IconEdit, IconUpload, type IconData } from "@/lib/icons";

function Tile({ href, icon, label }: { href: string; icon: IconData; label: string }) {
  return (
    <Link href={href} className="flex min-h-18 items-center gap-3 rounded-2xl bg-card p-4 shadow-xs transition-[box-shadow,translate] duration-(--dur-base) ease-out hover-ok:shadow-sm motion-ok:hover-ok:-translate-y-0.5">
      <span className="flex size-10 items-center justify-center rounded-xl bg-brand-tint text-brand-text"><Icon icon={icon} /></span>
      <span className="font-semibold">{label}</span>
    </Link>
  );
}

/**
 * État vide de Mes documents : directement les façons de commencer, sans phrase. Avec un brouillon vierge, ce sont les
 * tuiles de l'éditeur (contrat StartTiles) ; sinon, les mêmes entrées que « Commencer avec… ».
 */
export function StartPanel({ blankDraftId, ai, files }: { blankDraftId: string | null; ai: boolean; files: boolean }) {
  return (
    <section aria-label="Commencer avec…" className="stagger grid max-w-3xl gap-3">
      {ai && <PhotoEntry variant="tile" />}
      {blankDraftId ? <StartTiles documentId={blankDraftId} /> : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Tile href="/contribuer/nouveau" icon={IconEdit} label="Écrire" />
          {files && <Tile href="/contribuer/nouveau?depart=fichier" icon={IconUpload} label="Importer un fichier" />}
        </div>
      )}
    </section>
  );
}
