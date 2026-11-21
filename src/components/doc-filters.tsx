"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { cn } from "cn";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IconExpand, IconFavorite, IconSort } from "@/lib/icons";

export type FilterOption = { value: string; label: string; count?: number };
export type FilterMenu = { name: string; label: string; all: string; options: FilterOption[] };

const chip = (active: boolean) => cn(
  "flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap transition-colors duration-(--dur-fast) coarse:min-h-11",
  active ? "border-transparent bg-brand-tint text-brand-text" : "border-border bg-card text-muted-foreground hover:text-foreground",
);

/**
 * Une rangée de puces dans l'adresse de la page : le type en un toucher, Favoris à bascule, les filtres rares en menu, le tri au bout.
 * Rien ne s'affiche pour un filtre qui n'aurait qu'un choix.
 * `requiredType` (page d'une matière) : un type est toujours choisi, la puce active ne se décoche pas ;
 * le type par défaut (`fallback`) ne s'écrit pas dans l'adresse, pour que les anciens liens restent les mêmes.
 */
export function DocFilters({ types, requiredType, favorites, menus = [], sort, favoriteHint }: { types?: FilterOption[]; requiredType?: { selected: string; fallback: string }; favorites?: boolean; menus?: FilterMenu[]; sort?: FilterMenu; favoriteHint?: (chip: ReactNode) => ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (name: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value); else next.delete(name);
    const query = next.toString();
    start(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  };
  const type = params.get("type");
  const favoriteOn = params.get("favoris") === "1";
  const favoriteChip = (
    <button type="button" aria-pressed={favoriteOn} onClick={() => set("favoris", favoriteOn ? null : "1")} className={chip(favoriteOn)}>
      <Icon icon={IconFavorite} size={16} filled={favoriteOn} />Favoris
    </button>
  );
  return (
    <div data-pending={pending || undefined} className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
      {types && types.length > (requiredType ? 0 : 1) && (
        <div role="group" aria-label="Type" className="flex gap-1.5">
          {types.map((t) => {
            const active = requiredType ? requiredType.selected === t.value : type === t.value;
            const next = requiredType ? (t.value === requiredType.fallback ? null : t.value) : active ? null : t.value;
            return (
              <button key={t.value} type="button" aria-pressed={active} onClick={() => { if (!(requiredType && active)) set("type", next); }} className={chip(active)}>
                {t.label}{t.count !== undefined && <span className={cn("tabular-nums", !active && "text-muted-foreground/80")}>{t.count}</span>}
              </button>
            );
          })}
        </div>
      )}
      {favorites && (favoriteHint ? favoriteHint(favoriteChip) : favoriteChip)}
      {menus.filter((m) => m.options.length > 1).map((menu) => {
        const value = params.get(menu.name) ?? "";
        const current = menu.options.find((o) => o.value === value);
        return (
          <DropdownMenu key={menu.name}>
            <DropdownMenuTrigger aria-label={menu.label} className={chip(Boolean(current))}>
              {current?.label ?? menu.all}<Icon icon={IconExpand} size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 w-56">
              <DropdownMenuRadioGroup value={value} onValueChange={(next) => set(menu.name, next || null)}>
                <DropdownMenuRadioItem value="">{menu.all}</DropdownMenuRadioItem>
                {menu.options.map((o) => <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
      {sort && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="ml-auto shrink-0 text-muted-foreground" aria-label={sort.label} />}>
            <Icon icon={IconSort} size={16} />{sort.options.find((o) => o.value === (params.get(sort.name) ?? ""))?.label ?? sort.all}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuRadioGroup value={params.get(sort.name) ?? ""} onValueChange={(next) => set(sort.name, next || null)}>
              <DropdownMenuRadioItem value="">{sort.all}</DropdownMenuRadioItem>
              {sort.options.map((o) => <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
