"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUserAny } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { setMailScope, setNotificationMail, setWeeklyMail } from "@/lib/notification-state";
import { parseUnsubscribeToken } from "@/lib/security";
import { forgetShellCounters } from "@/lib/shell-cache";
import { HOME } from "@/lib/home";

const { notifications, notificationState } = schema;

export async function markAllNotificationsRead() {
  const user = await requireUserAny();
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  forgetShellCounters(user.id);
  revalidatePath("/notifications");
}

export async function saveWeeklyMail(enabled: boolean) {
  const user = await requireUserAny();
  await setWeeklyMail(user.id, z.boolean().parse(enabled));
}

export async function saveNotificationMail(enabled: boolean) {
  const user = await requireUserAny();
  await setNotificationMail(user.id, z.boolean().parse(enabled));
}

export async function dismissReturnBlock() {
  const user = await requireUserAny();
  await db.update(notificationState).set({ returnedFrom: null, returnedAt: null }).where(eq(notificationState.userId, user.id));
  revalidatePath(HOME);
}

export async function keepWeeklyMail(form: FormData) {
  const token = String(form.get("token") ?? "");
  const parsed = parseUnsubscribeToken(token);
  if (!parsed) return;
  await setMailScope(parsed.userId, parsed.scope, true);
  redirect(`/desabonnement/${encodeURIComponent(token)}?garde=1`);
}
