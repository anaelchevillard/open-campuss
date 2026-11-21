import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import { IconClose } from "@/lib/icons";

/**
 * Habillage plein écran de la séance et du quiz, hors Shell : croix en haut à gauche, progression, un coin à droite.
 * Le bas reste aux actions, au-dessus de la zone sûre.
 */
export function SessionFrame({ exitHref, exitLabel = "Quitter la séance", progress, right, children, title }: { exitHref: string; exitLabel?: string; progress?: ReactNode; right?: ReactNode; children: ReactNode; title?: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background pt-safe">
      <header className="sticky top-0 z-(--z-header) bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 md:px-6">
          <Link href={exitHref} aria-label={exitLabel} className="relative grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground after:absolute after:-inset-1.5 coarse:size-11">
            <Icon icon={IconClose} />
          </Link>
          <div className="min-w-0 flex-1">
            {title && <h1 className="sr-only">{title}</h1>}
            {progress}
          </div>
          <div className="flex min-w-9 shrink-0 items-center justify-end gap-2 text-sm">{right}</div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-safe md:px-6">{children}</main>
    </div>
  );
}
