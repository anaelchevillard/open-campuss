"use client";

import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { clearOffline } from "@/components/app-nav";
import { Icon } from "@/components/icon";
import { useMode } from "@/components/nav/use-mode";
import { Button } from "@/components/ui/button";
import { IconLogout, IconModeAdmin, IconModeEdit, IconModeRead } from "@/lib/icons";
import { MODE_LABELS, modesOf, type Role } from "@/lib/modes";

const ICONS = { read: IconModeRead, edit: IconModeEdit, admin: IconModeAdmin, teach: IconModeRead };

/** Changer d'espace au téléphone. */
export function ModeLinks({ role }: { role: Role }) {
  const mode = useMode(role);
  const modes = modesOf(role);
  if (modes.length < 2) return null;
  return (
    <nav aria-label="Changer d’espace" className="grid gap-2">
      <span className="px-1 text-sm font-semibold text-muted-foreground">Espace</span>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {modes.map((m) => {
          const active = m.mode === mode;
          return (
            <Link key={m.mode} href={m.href} aria-current={active ? "page" : undefined}
              className={`flex min-h-12 items-center gap-2 rounded-xl px-3 font-semibold transition-colors ${active ? "bg-brand-tint text-brand-text" : "bg-card shadow-xs hover:bg-muted"}`}>
              <Icon icon={ICONS[m.mode]} />{MODE_LABELS[m.mode]}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function LogoutButton() {
  return <Button variant="ghost" className="justify-self-center text-muted-foreground" onClick={() => { clearOffline(); void logout(); }}><Icon icon={IconLogout} size={16} />Se déconnecter</Button>;
}
