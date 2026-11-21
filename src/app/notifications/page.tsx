import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { markAllNotificationsRead } from "@/app/actions/notifications";
import { Icon } from "@/components/icon";
import { EmptyState } from "@/components/empty-state";
import { NotificationRow } from "@/components/notification-bell";
import { PageHeader } from "@/components/page-header";
import { Shell } from "@/components/shell";
import { Submit } from "@/components/submit";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { IconDone, IconNotifications } from "@/lib/icons";
import { timeAgo } from "@/lib/notification-view";

export const metadata: Metadata = { title: "Notifications" };

const { notifications } = schema;
const DAY = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
const KEY = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" });

/** Groupes par jour : aujourd'hui, hier, puis la date. */
function dayLabel(date: Date, now = new Date()) {
  const key = KEY.format(date);
  if (key === KEY.format(now)) return "Aujourd’hui";
  if (key === KEY.format(new Date(now.getTime() - 86_400_000))) return "Hier";
  const label = DAY.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default async function NotificationsPage() {
  const user = await requireUser();
  // « Voir comme » : la sécurité, les blocages et les notifications restent privés
  if (user.viewing) notFound();
  const rows = await db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(500);
  const hasUnread = rows.some((row) => !row.readAt);
  const groups = new Map<string, typeof rows>();
  for (const row of rows) { const label = dayLabel(row.createdAt); groups.set(label, [...(groups.get(label) ?? []), row]); }
  return (
    <Shell user={user}>
      <div className="grid max-w-2xl gap-6">
        <PageHeader title="Notifications" className="mb-0"
          action={hasUnread ? <form action={markAllNotificationsRead}><Submit variant="outline"><Icon icon={IconDone} size={16} />Tout marquer comme lu</Submit></form> : undefined} />
        {rows.length ? [...groups].map(([label, items], index) => (
          <section key={label} className="grid gap-2 animate-[rise_var(--dur-slow)_var(--ease-out)_both]" style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}>
            <h2 className="px-1 text-sm font-semibold text-muted-foreground">{label}</h2>
            <ul className="grid gap-0.5 rounded-xl bg-card p-2 shadow-xs">
              {items.map((row) => <li key={row.id}><NotificationRow item={{ id: row.id, title: row.title, body: row.body, href: row.href, read: Boolean(row.readAt), when: timeAgo(row.createdAt) }} /></li>)}
            </ul>
          </section>
        )) : <EmptyState icon={IconNotifications} title="Aucune notification" description="Réponses, nouveaux cours et demandes d’amis arrivent ici" />}
      </div>
    </Shell>
  );
}
