"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { cn } from "cn";
import { dismissAnnouncement } from "@/app/actions/admin/announcements";
import { Icon } from "@/components/icon";
import { PAGE_GUTTER } from "@/components/page-container";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { Button } from "@/components/ui/button";
import { IconClose, IconError, IconEye, IconInfo, IconWarning } from "@/lib/icons";

const TONES = {
  info: { variant: "info", icon: IconInfo },
  warning: { variant: "warning", icon: IconWarning },
  critical: { variant: "destructive", icon: IconError },
} as const;

/** Annonce : une ligne sous l'en-tête ; au téléphone, tronquée, elle s'ouvre au toucher. Masquage mémorisé en base. */
export function AnnouncementLine({ id, body, href, tone, dismissible }: { id: string; body: string; href: string | null; tone: keyof typeof TONES; dismissible: boolean }) {
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  if (hidden) return null;
  const { variant, icon } = TONES[tone];
  return (
    <div className={cn(PAGE_GUTTER, "pt-3 motion-ok:animate-rise [animation-duration:var(--dur-base)]")}>
      <Alert variant={variant} role={tone === "critical" ? "alert" : "status"} className="mx-auto max-w-6xl py-2">
        <Icon icon={icon} size={16} />
        <AlertDescription className="text-foreground">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cn("w-full text-left md:pointer-events-none", !open && "line-clamp-1 md:line-clamp-none")}>
            {body}
          </button>
          {href && <Link href={href} className="font-semibold text-link underline underline-offset-2">En savoir plus</Link>}
        </AlertDescription>
        {dismissible && (
          <Button variant="ghost" size="icon-sm" aria-label="Masquer l’annonce" className="col-start-3 row-start-1 -my-1 self-start" onClick={() => { setHidden(true); start(() => dismissAnnouncement(id)); }}>
            <Icon icon={IconClose} size={16} />
          </Button>
        )}
      </Alert>
    </div>
  );
}

const twoDigits = (n: number) => String(n).padStart(2, "0");

/** Bandeau du « voir comme » : collé en haut, non masquable, avec le temps restant et Quitter. */
export function ViewBanner({ name, expiresAt, action }: { name: string; expiresAt: string; action: string }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setLeft(ms);
      if (ms <= 0) window.location.reload();
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  const time = left === null ? "" : `${twoDigits(Math.max(0, Math.floor(left / 60_000)))}:${twoDigits(Math.max(0, Math.floor(left / 1000) % 60))}`;
  return (
    <div className={cn(PAGE_GUTTER, "sticky top-0 z-(--z-header) pt-2")} data-view-banner>
      <Alert variant="warning" className="mx-auto min-h-11 max-w-6xl bg-warning-tint py-1.5">
        <Icon icon={IconEye} size={16} />
        <AlertDescription className="font-semibold text-warning-foreground">
          <span>Tu vois Campuss comme {name}{time && <> · <span className="tabular-nums" aria-label={`${time} restantes`}>{time}</span></>}</span>
        </AlertDescription>
        <form action={action} method="post" className="col-start-3 row-start-1">
          <Button type="submit" size="sm" variant="outline">Quitter</Button>
        </form>
      </Alert>
    </div>
  );
}
