"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "cn";
import { logout } from "@/app/actions/auth";
import { useCreateSheet } from "@/components/create-sheet";
import { Icon } from "@/components/icon";
import { Logo } from "@/components/logo";
import { currentHref, sidebarGroups, type NavCounts, type NavItem } from "@/components/nav/config";
import { useMode } from "@/components/nav/use-mode";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { IconAdd, IconExpand, IconLogout, IconMe, IconMore, IconNews, IconPalette, IconSettings, IconSidebar } from "@/lib/icons";
import { isCurrent, MODE_LABELS, modesOf, type Mode, type Role } from "@/lib/modes";
import { snappy } from "@/lib/motion";
import { absoluteSemester, SEMESTER_COOKIE, type Parity } from "@/lib/semester-rules";
import { HOME } from "@/lib/home";

export type SemesterNav = { level: number; parity: Parity; current: Parity; levels: number[]; subjects: { id: number; name: string }[] };

// Les cours gardés hors ligne ne doivent pas survivre à la déconnexion, sur un appareil partagé par exemple
export const clearOffline = () => { void navigator.serviceWorker?.ready.then((w) => w.active?.postMessage({ type: "clear" })); };

function NavLink({ item, active, layoutGroup }: { item: NavItem; active: boolean; layoutGroup: string }) {
  const { state } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={active} tooltip={state === "collapsed" ? item.label : undefined}
        className="relative text-[0.9375rem] data-active:bg-transparent data-active:text-brand-text"
        render={<Link href={item.href} aria-current={active ? "page" : undefined} />}>
        {active && <motion.span layoutId={layoutGroup} transition={snappy} className="absolute inset-0 -z-0 rounded-lg bg-brand-tint" />}
        {item.icon && <Icon icon={item.icon} strokeWidth={active ? 2 : undefined} className={cn("relative", !active && "text-muted-foreground")} />}
        <span className="relative">{item.label}</span>
      </SidebarMenuButton>
      {Boolean(item.count) && <SidebarMenuBadge className="tabular-nums">{item.count}</SidebarMenuBadge>}
    </SidebarMenuItem>
  );
}

function ModeSwitch({ role, mode, attention }: { role: Role; mode: Mode; attention: Partial<Record<Mode, number>> }) {
  const modes = modesOf(role);
  if (modes.length < 2) return null;
  return (
    <nav aria-label="Changer d’espace" className="flex gap-0.5 rounded-lg bg-sidebar-accent p-0.5 group-data-[collapsible=icon]:hidden">
      {modes.map((m) => {
        const active = m.mode === mode;
        return (
          <Link key={m.mode} href={m.href} aria-current={active ? "page" : undefined} className={cn("relative flex min-h-8 flex-1 items-center justify-center rounded-md px-1 text-sm font-semibold transition-colors", active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}>
            {m.mode === "admin" ? "Admin" : MODE_LABELS[m.mode]}
            {!active && Boolean(attention[m.mode]) && <span aria-hidden="true" className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" />}
          </Link>
        );
      })}
    </nav>
  );
}

function rememberSemester(level: number, parity: Parity) {
  document.cookie = `${SEMESTER_COOKIE}=${parity}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
  document.cookie = `campuss-annee=${level}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
}

/** « L1 · S1 » : choisir l'année et le semestre dont on voit les matières. */
function SemesterPicker({ semester }: { semester: SemesterNav }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const choose = (level: number, parity: Parity) => {
    rememberSemester(level, parity);
    setOpen(false);
    router.refresh();
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
        L{semester.level} · S{absoluteSemester(semester.level, semester.parity)}<Icon icon={IconExpand} size={16} className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-3 p-3">
        {semester.levels.map((level) => (
          <div key={level} className="grid gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">L{level}</span>
            <div className="grid grid-cols-2 gap-1">
              {([1, 2] as const).map((parity) => {
                const active = level === semester.level && parity === semester.parity;
                return (
                  <button key={parity} type="button" onClick={() => choose(level, parity)} aria-pressed={active}
                    className={cn("flex min-h-9 items-center justify-center gap-1.5 rounded-lg border text-sm font-semibold", active ? "border-brand-text bg-brand-tint text-brand-text" : "border-border hover:bg-muted")}>
                    S{absoluteSemester(level, parity)}
                    {level === semester.level && parity === semester.current && <span className="size-1.5 rounded-full bg-success" aria-label="en cours" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function AccountMenu({ role, name, rank, avatar, profileHref }: { role: Role; name: string; rank: string; avatar: ReactNode; profileHref: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full min-w-0 items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0.5" aria-label="Compte">
        {avatar}
        <span className="min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
          <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">{rank}</span>
        </span>
        <Icon icon={IconMore} size={16} className="text-muted-foreground group-data-[collapsible=icon]:hidden" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuItem render={<Link href={profileHref} />}><Icon icon={IconMe} size={16} />Profil</DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/parametres" />}><Icon icon={IconSettings} size={16} />Paramètres</DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/actualites" />}><Icon icon={IconNews} size={16} />Actualités</DropdownMenuItem>
        {role === "admin" && <DropdownMenuItem render={<Link href="/admin/charte" />}><Icon icon={IconPalette} size={16} />Charte</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => { clearOffline(); void logout(); }}><Icon icon={IconLogout} size={16} />Se déconnecter</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Ordinateur et tablette paysage : repliée en icônes par défaut entre 1024 et 1279 px tant que rien n'a été choisi. */
function AutoCollapse({ chosen }: { chosen: boolean }) {
  const { setOpen } = useSidebar();
  useEffect(() => {
    if (!chosen && window.matchMedia("(max-width: 1279px)").matches) setOpen(false, false);
  }, [chosen, setOpen]);
  return null;
}

export function AppSidebar({ role, name, rank, avatar, profileHref, counts, semester, chosen }: { role: Role; name: string; rank: string; avatar: ReactNode; profileHref: string; counts: NavCounts; semester: SemesterNav | null; chosen: boolean }) {
  const pathname = usePathname();
  const mode = useMode(role);
  const groups = sidebarGroups(mode, role, counts);
  const all = groups.flatMap((g) => g.items);
  const subjectItems = mode === "read" && semester ? semester.subjects.map((s) => ({ href: `/matieres/${s.id}`, label: s.name })) : [];
  const current = pathname.startsWith("/matieres/") ? pathname : currentHref(all, pathname, isCurrent);
  const { toggleSidebar } = useSidebar();
  const create = useCreateSheet();
  const attention = { edit: counts.toReview, admin: counts.pending + counts.reports };
  return (
    <Sidebar collapsible="icon" data-mode={mode} style={{ viewTransitionName: "app-sidebar" }}>
      <AutoCollapse chosen={chosen} />
      <SidebarHeader className="gap-3 p-3">
        <div className="flex min-h-9 items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center">
          <Link href={modesOf(role).find((m) => m.mode === mode)?.href ?? HOME} aria-label="Campuss, accueil de cet espace" className="flex items-center rounded-sm px-1 group-data-[collapsible=icon]:hidden"><Logo className="h-6 w-auto" /></Link>
          <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Replier la barre latérale (touche [)" className="text-muted-foreground"><Icon icon={IconSidebar} /></Button>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-1">
        {groups.map((group) => (
          <SidebarGroup key={group.title ?? "principal"}>
            {group.title && <SidebarGroupLabel>{group.title}</SidebarGroupLabel>}
            <SidebarGroupContent><SidebarMenu>{group.items.map((item) => <NavLink key={item.href} item={item} active={item.href === current} layoutGroup="sidebar-active" />)}</SidebarMenu></SidebarGroupContent>
          </SidebarGroup>
        ))}
        {semester && mode === "read" && (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <div className="flex items-center justify-between pr-1"><SemesterPicker semester={semester} /></div>
            <SidebarGroupContent>
              <SidebarMenu>
                {subjectItems.length
                  ? subjectItems.map((item) => <NavLink key={item.href} item={item} active={item.href === current} layoutGroup="sidebar-active" />)
                  : <p className="px-2 py-1.5 text-sm text-muted-foreground">Aucune matière ce semestre</p>}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="gap-2 p-3">
        {role !== "teacher" && (
          <Button variant="outline" onClick={create.open} className="w-full justify-start group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0" aria-label="Nouveau">
            <Icon icon={IconAdd} /><span className="group-data-[collapsible=icon]:hidden">Nouveau</span>
          </Button>
        )}
        <ModeSwitch role={role} mode={mode} attention={attention} />
        <AccountMenu role={role} name={name} rank={rank} avatar={avatar} profileHref={profileHref} />
      </SidebarFooter>
    </Sidebar>
  );
}
