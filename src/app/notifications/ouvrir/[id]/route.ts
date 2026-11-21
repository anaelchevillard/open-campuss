import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { currentUser, safeNext } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { json } from "@/lib/http";
import { forgetShellCounters } from "@/lib/shell-cache";

const { notifications } = schema;

/** Une ligne qui n'est pas à cette personne ne change pas et ne dit rien : même réponse qu'un identifiant inconnu. */
async function markOpened(rawId: string, userId: string) {
  if (!z.uuid().safeParse(rawId).success) return null;
  const [row] = await db.update(notifications).set({ readAt: sql`coalesce(${notifications.readAt}, now())`, clickedAt: sql`coalesce(${notifications.clickedAt}, now())` })
    .where(and(eq(notifications.id, rawId), eq(notifications.userId, userId))).returning({ href: notifications.href });
  forgetShellCounters(userId);
  return row ?? null;
}

const go = (path: string) => new Response(null, { status: 303, headers: { Location: new URL(path, env.baseUrl).href, "Cache-Control": "no-store" } });

// Le lien d'un push ou d'un mail. Sans session, un analyseur de mails ne compte donc pas comme une ouverture.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return go(`/login?next=${encodeURIComponent(`/notifications/ouvrir/${id}`)}`);
  const row = await markOpened(id, user.id);
  return go(row ? safeNext(row.href) : "/notifications");
}

// Le clic dans le centre : la navigation reste celle de l'application
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return json({ error: "Accès refusé" }, 403);
  await markOpened((await params).id, user.id);
  return json({ ok: true });
}
