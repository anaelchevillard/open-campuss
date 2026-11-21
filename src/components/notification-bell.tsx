"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { homeOf } from "@/lib/home";
import { useState, type MouseEvent, type ReactNode } from "react";
import { markAllNotificationsRead } from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { unreadLabel } from "@/lib/notification-view";
import { Icon } from "@/components/icon";
import { IconNotifications } from "@/lib/icons";

type Item = { id: string; title: string; body: string; href: string; read: boolean; when: string };

/** Sans JavaScript, ou ouvert dans un autre onglet, le lien passe par la route qui marque comme lu puis redirige. */
export function NotificationLink({ id, href, className, onOpen, children }: { id: string; href: string; className?: string; onOpen?: () => void; children: ReactNode }) {
  const router = useRouter();
  const open = async (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onOpen?.();
    // Attendre l'écriture : la page suivante affiche le compteur à jour
    await fetch(`/notifications/ouvrir/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => undefined);
    router.push(homeOf(href));
  };
  return <a href={`/notifications/ouvrir/${id}`} onClick={open} className={className}>{children}</a>;
}

export function NotificationRow({ item, onOpen }: { item: Item; onOpen?: () => void }) {
  return (
    <NotificationLink id={item.id} href={item.href} onOpen={onOpen} className="flex gap-2.5 rounded-md p-2 transition-colors hover:bg-muted">
      <span aria-hidden="true" className={`mt-2 size-1.5 shrink-0 rounded-full ${item.read ? "" : "bg-primary"}`} />
      <span className="min-w-0 flex-1">
        <span className={`block wrap-break-word ${item.read ? "" : "font-semibold"}`}>{item.title}{!item.read && <span className="sr-only"> (non lue)</span>}</span>
        {item.body && <span className="line-clamp-2 block text-sm text-muted-foreground wrap-break-word">{item.body}</span>}
        <span className="block text-xs text-muted-foreground">{item.when}</span>
      </span>
    </NotificationLink>
  );
}

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    setFailed(false);
    try {
      const response = await fetch("/api/notifications");
      if (!response.ok) throw new Error("indisponible");
      const data = await response.json() as { unread: number; items: Item[] };
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      setFailed(true);
    }
  };
  const markAll = () => {
    setUnread(0);
    setItems((list) => list?.map((item) => ({ ...item, read: true })) ?? null);
    void markAllNotificationsRead();
  };

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) void load(); }}>
      <PopoverTrigger aria-label={unread ? `Notifications, ${unread} non lues` : "Notifications"} className="relative flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:size-9">
        <Icon icon={IconNotifications} className="size-5" />
        {unread > 0 && <span aria-hidden="true" className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.6875rem] font-semibold tabular-nums text-primary-foreground md:right-0 md:top-0">{unreadLabel(unread)}</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] gap-1 p-2">
        <div className="flex min-h-9 items-center justify-between gap-2 px-2">
          <h2 className="font-sans text-sm font-semibold">Notifications</h2>
          {unread > 0 && <Button variant="ghost" size="sm" onClick={markAll}>Tout marquer comme lu</Button>}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {failed ? <p className="p-2 text-muted-foreground">Impossible de charger pour l’instant.</p>
            : !items ? <div className="grid gap-2 p-2"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
            : items.length ? <ul>{items.map((item) => <li key={item.id}><NotificationRow item={item} onOpen={() => setOpen(false)} /></li>)}</ul>
            : <p className="p-2 text-muted-foreground">Rien pour l’instant.</p>}
        </div>
        <Link href="/notifications" onClick={() => setOpen(false)} className="block rounded-md p-2 text-center font-semibold hover:bg-muted">Tout voir</Link>
      </PopoverContent>
    </Popover>
  );
}
