"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Icon } from "@/components/icon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IconExpand, IconProgram } from "@/lib/icons";
import { HOME } from "@/lib/home";

/** Administration : la licence affichée à l'accueil, dans l'adresse (?licence=). */
export function ProgramSelect({ current, programs }: { current: string; programs: { slug: string; name: string; active: boolean }[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const name = programs.find((p) => p.slug === current)?.name ?? "Licence";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Licence affichée : ${name}`} className="flex min-h-9 max-w-56 items-center gap-1.5 rounded-lg bg-muted px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent coarse:min-h-11">
        <Icon icon={IconProgram} size={16} className="text-muted-foreground" /><span className="truncate">{name}</span><Icon icon={IconExpand} size={16} className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuRadioGroup value={current} onValueChange={(slug) => start(() => router.push(`${HOME}?licence=${slug}`))}>
          {programs.map((p) => <DropdownMenuRadioItem key={p.slug} value={p.slug}>{p.name}{p.active ? "" : " (fermée)"}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
