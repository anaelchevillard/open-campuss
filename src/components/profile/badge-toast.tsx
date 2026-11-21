"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { markBadgesSeen } from "@/app/actions/social";
import { Icon } from "@/components/icon";
import { BadgeMedal } from "@/components/profile/badge-medal";
import { badgeOf } from "@/lib/badges";
import { celebrate } from "@/lib/celebrate";
import { IconClose } from "@/lib/icons";

/**
 * Un seul moment de fête : le badge apparaît une fois (reflet, confettis du jour), puis ne revient plus.
 * Non bloquante : petite, fermable, et sur ordinateur en bas à gauche (sur la barre latérale), loin des formulaires.
 */
export function BadgeToast({ badges }: { badges: { id: string; name: string }[] }) {
  const [visible, setVisible] = useState(true);
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !badges.length) return;
    done.current = true;
    void markBadgesSeen(badges.map((b) => b.id));
    void celebrate("badge");
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [badges]);
  if (!visible || !badges.length) return null;
  const first = badgeOf(badges[0].id);
  return (
    <div role="status" className="fixed right-4 bottom-safe z-(--z-toast) flex w-[min(20rem,calc(100vw-2rem))] items-center rounded-xl bg-popover text-popover-foreground shadow-md animate-[rise_var(--dur-slow)_var(--ease-out)_both] lg:right-auto lg:bottom-4 lg:left-4">
      <Link href="/moi" onClick={() => setVisible(false)} className="trophy flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2.5">
        {first && <BadgeMedal icon={first.icon} rarity={first.rarity} hue={first.hue} size={32} className="pop" />}
        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground">{badges.length > 1 ? `${badges.length} nouveaux badges` : "Nouveau badge"}</span>
          <span className="block truncate text-sm font-semibold">{badges.map((b) => b.name).join(", ")}</span>
        </span>
      </Link>
      <button type="button" onClick={() => setVisible(false)} aria-label="Fermer" className="mr-1.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><Icon icon={IconClose} size={16} /></button>
    </div>
  );
}
