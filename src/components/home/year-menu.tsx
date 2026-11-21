"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Icon } from "@/components/icon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IconExpand } from "@/lib/icons";

/** L'année dont on voit les matières : le même cookie que la barre latérale, sans rien changer au compte. */
export function YearMenu({ level, levels = [1, 2, 3] }: { level: number; levels?: number[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const choose = (value: number) => {
    document.cookie = `campuss-annee=${value}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
    start(() => router.refresh());
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Année : L${level}`} className="flex min-h-9 items-center gap-1 rounded-lg bg-muted px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent coarse:min-h-11">
        L{level}<Icon icon={IconExpand} size={16} className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuRadioGroup value={String(level)} onValueChange={(value) => choose(Number(value))}>
          {levels.map((l) => <DropdownMenuRadioItem key={l} value={String(l)}>Licence {l}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
