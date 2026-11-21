"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { useCreateSheet } from "@/components/create-sheet";
import { Icon } from "@/components/icon";
import { currentHref, tabItems, type NavCounts, type NavItem } from "@/components/nav/config";
import { useMode } from "@/components/nav/use-mode";
import { IconAdd } from "@/lib/icons";
import { isCurrent, type Role } from "@/lib/modes";

function Tab({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined}
      className={cn("relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs transition-colors", active ? "font-semibold text-brand-text" : "text-muted-foreground")}>
      {active && <span className="absolute top-1.5 h-8 w-14 rounded-full bg-brand-tint" />}
      <span className="relative">
        <Icon icon={item.icon!} size={24} strokeWidth={active ? 2 : 1.75} />
        {Boolean(item.count) && <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.6875rem] leading-none font-semibold text-primary-foreground tabular-nums">{item.count}</span>}
      </span>
      <span className="relative leading-tight">{item.label}</span>
    </Link>
  );
}

/** Téléphone et tablette portrait : 5 cases, le + au centre ouvre « Commencer avec… ». Toujours visible, sur toutes les pages. */
export function TabBar({ role, counts }: { role: Role; counts: NavCounts }) {
  const pathname = usePathname();
  const mode = useMode(role);
  const items = tabItems(mode, role, counts);
  const current = currentHref(items.filter((i): i is NavItem => Boolean(i)), pathname, isCurrent);
  const create = useCreateSheet();
  return (
    <nav aria-label="Navigation principale" style={{ viewTransitionName: "app-tabbar" }}
      className="fixed inset-x-0 bottom-0 z-(--z-tabbar) border-t border-border bg-card/95 pb-safe backdrop-blur-md lg:hidden">
      <div className="mx-auto flex h-(--tabbar-h) max-w-[600px] items-stretch px-1">
        {items.map((item, i) => item
          ? <Tab key={item.href} item={item} active={item.href === current} />
          : (
            <div key={`plus-${i}`} className="flex flex-1 items-center justify-center">
              <button type="button" onClick={create.open} aria-label="Nouveau" className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-[background-color,scale] hover:bg-primary-hover motion-ok:active:scale-95">
                <Icon icon={IconAdd} size={24} strokeWidth={2} />
              </button>
            </div>
          ))}
      </div>
    </nav>
  );
}
