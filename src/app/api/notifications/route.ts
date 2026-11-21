import { and, count, desc, eq, isNull } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { json } from "@/lib/http";
import { timeAgo } from "@/lib/notification-view";

const { notifications } = schema;

/** Lu à l'ouverture de la cloche seulement : les pages n'ont besoin que du compteur. */
export async function GET() {
  const user = await currentUser();
  if (!user) return json({ error: "Accès refusé" }, 403);
  const [rows, [unread]] = await Promise.all([
    db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(8),
    db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))),
  ]);
  return json({ unread: unread.n, items: rows.map((row) => ({ id: row.id, title: row.title, body: row.body, href: row.href, read: Boolean(row.readAt), when: timeAgo(row.createdAt) })) });
}
