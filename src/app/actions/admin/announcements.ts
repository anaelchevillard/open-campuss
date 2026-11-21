"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth";
import { auditAction } from "@/lib/audit";
import { db, schema } from "@/lib/db";

const { announcements, announcementDismissals } = schema;

/** Masquer une annonce : mémorisé en base, elle ne revient sur aucun appareil. */
export async function dismissAnnouncement(id: string) {
  const user = await requireUser();
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return;
  const [row] = await db.select({ dismissible: announcements.dismissible }).from(announcements).where(eq(announcements.id, parsed.data));
  if (!row?.dismissible) return;
  await db.insert(announcementDismissals).values({ announcementId: parsed.data, userId: user.id }).onConflictDoNothing();
}

const input = z.object({
  id: z.uuid().optional(),
  body: z.string().trim().min(3, "Écris l’annonce.").max(140, "140 caractères au plus."),
  href: z.string().trim().max(500).refine((v) => !v || /^\/(?![/\\])/.test(v) || /^https:\/\//.test(v), "Lien attendu : /chemin ou https://…"),
  tone: z.enum(["info", "warning", "critical"]),
  dismissible: z.boolean(),
  programIds: z.array(z.number().int().positive()).max(50),
  levels: z.array(z.number().int().min(1).max(3)).max(3),
  roles: z.array(z.enum(["member", "delegate", "teacher", "admin"])).max(4),
  startsAt: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/),
  endsAt: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/),
});
export type AnnouncementInput = z.input<typeof input>;

const day = (value: string, end = false) => (value ? new Date(`${value}T${end ? "23:59:00" : "00:00:00"}+01:00`) : null);

/** Annonce bannière : courante, enregistrée sur place. */
export async function saveAnnouncement(raw: AnnouncementInput): Promise<{ error?: string; id?: string }> {
  const admin = await requireAdmin();
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const values = {
    body: v.body, href: v.href || null, tone: v.tone, dismissible: v.tone === "critical" ? false : v.dismissible,
    audience: { programIds: v.programIds, levels: v.levels, roles: v.roles }, startsAt: day(v.startsAt) ?? new Date(), endsAt: day(v.endsAt, true),
  };
  if (values.endsAt && values.endsAt <= values.startsAt) return { error: "La fin doit venir après le début." };
  let id = v.id;
  if (id) {
    const [before] = await db.select().from(announcements).where(eq(announcements.id, id));
    if (!before) return { error: "Annonce introuvable." };
    await db.update(announcements).set(values).where(eq(announcements.id, id));
    await auditAction(admin, { action: "annonce.modifiee", target: { type: "announcement", id, label: v.body }, before: { body: before.body, tone: before.tone }, after: { body: v.body, tone: v.tone } });
  } else {
    [{ id }] = await db.insert(announcements).values({ ...values, createdBy: admin.id }).returning({ id: announcements.id });
    await auditAction(admin, { action: "annonce.publiee", target: { type: "announcement", id: id!, label: v.body } });
  }
  revalidatePath("/", "layout");
  return { id };
}

/** Retirer = finir maintenant (la ligne reste pour l'historique ; « Annuler » la remet). */
export async function endAnnouncement(id: string, restoreEnd?: string | null): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  const parsed = z.uuid().parse(id);
  const [row] = await db.update(announcements).set({ endsAt: restoreEnd === undefined ? new Date() : restoreEnd ? new Date(restoreEnd) : null }).where(eq(announcements.id, parsed)).returning();
  if (row) await auditAction(admin, { action: "annonce.retiree", target: { type: "announcement", id: row.id, label: row.body } });
  revalidatePath("/", "layout");
  return {};
}
