"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminFor, isStepUp, type AdminResult } from "@/lib/admin-ops";
import { audit, requireUser } from "@/lib/auth";
import { auditAction } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import { addReviewEvent, authorsOf } from "@/lib/document-reviews";
import { syncBadges } from "@/lib/gamification";
import { notifyAdmins } from "@/lib/mail";
import { adminMails } from "@/lib/mail/catalog";
import { notify } from "@/lib/notify";
import { rateHit, rateLimited } from "@/lib/security";
import { forgetAllShellCounters } from "@/lib/shell-cache";
import { forgetAuthorStats } from "@/lib/site-stats";
import { canWithdrawDirectly, cleanWithdrawalReason, cleanWithdrawalResponse, WITHDRAWAL_REASON_MIN, WITHDRAWALS_PER_DAY } from "@/lib/withdrawal-rules";

const { documents, withdrawalRequests } = schema;
const uuid = z.uuid();

export type WithdrawalResult = { ok: true } | { error: string };

/** L'auteur étudiant d'un cours publié demande son retrait, justification à l'appui. */
export async function requestWithdrawal(rawId: string, rawReason: unknown): Promise<WithdrawalResult> {
  const user = await requireUser();
  const parsed = uuid.safeParse(rawId);
  if (!parsed.success) return { error: "Cours introuvable." };
  const [doc] = await db.select().from(documents).where(eq(documents.id, parsed.data));
  if (!doc || doc.deletedAt || doc.createdBy !== user.id) return { error: "Cours introuvable." };
  if (!doc.published) return { error: "Ce cours n’est pas publié : tu peux le retirer toi-même." };
  if (canWithdrawDirectly(user, doc)) return { error: "Tu peux retirer ce cours toi-même depuis Mes documents." };
  const reason = cleanWithdrawalReason(rawReason);
  if (!reason) return { error: `Explique en quelques mots pourquoi (au moins ${WITHDRAWAL_REASON_MIN} caractères).` };
  const key = `withdrawal:${user.id}`;
  if (await rateLimited(key, WITHDRAWALS_PER_DAY, 1440)) return { error: "Trop de demandes aujourd’hui. Réessaie demain." };
  const [row] = await db.insert(withdrawalRequests).values({ documentId: doc.id, requesterId: user.id, reason }).onConflictDoNothing().returning({ id: withdrawalRequests.id });
  if (!row) return { error: "Une demande de retrait attend déjà la réponse de l’administration." };
  await rateHit(key);
  await audit(user.email, "retrait_demandé", doc.title);
  await notifyAdmins(adminMails.withdrawalToReview(doc.title));
  forgetAllShellCounters();
  revalidatePath("/contribuer");
  revalidatePath("/admin/moderation");
  return { ok: true };
}

/** L'administration accepte (le cours redevient un brouillon de son auteur) ou refuse avec un motif ; l'auteur est prévenu. */
export async function decideWithdrawal(rawId: string, decision: "accept" | "refuse", rawResponse = ""): Promise<AdminResult> {
  const admin = await adminFor("routine");
  if (isStepUp(admin)) return admin;
  const parsed = uuid.safeParse(rawId);
  if (!parsed.success) return { error: "Demande introuvable." };
  const response = cleanWithdrawalResponse(rawResponse, decision);
  if (response === false) return { error: "Indique le motif du refus." };
  // Une seule décision : la mise à jour ne prend que la demande encore ouverte
  const [request] = await db.update(withdrawalRequests).set({ status: decision === "accept" ? "accepted" : "refused", response, decidedBy: admin.id, decidedAt: new Date() })
    .where(and(eq(withdrawalRequests.id, parsed.data), eq(withdrawalRequests.status, "pending"))).returning();
  if (!request) return { error: "Demande déjà traitée." };
  const [doc] = await db.select().from(documents).where(eq(documents.id, request.documentId));
  if (!doc) return { ok: "Le cours n’existe plus." };
  const authors = await authorsOf(doc.id, doc.createdBy);
  if (decision === "accept" && doc.published) {
    await db.update(documents).set({ published: false, postReviewAt: null, updatedAt: new Date() }).where(eq(documents.id, doc.id));
    await addReviewEvent({ documentId: doc.id, authorId: admin.id, kind: "removed", body: "Retiré de la publication à la demande de l’auteur" });
    for (const author of authors) { await syncBadges(author); forgetAuthorStats(author); }
  }
  await auditAction(admin, { action: decision === "accept" ? "retrait.accepte" : "retrait.refuse", target: { type: "document", id: doc.id, label: doc.title }, after: { response } });
  if (request.requesterId) {
    const accepted = decision === "accept";
    await notify(request.requesterId, {
      kind: "withdrawal",
      title: accepted ? "Ton cours est retiré de la publication" : "Ta demande de retrait est refusée",
      body: response ? `${doc.title} : ${response}` : doc.title,
      href: accepted ? `/editer/${doc.id}` : `/d/${doc.id}`,
      mail: {
        subject: accepted ? "ton cours est retiré de la publication" : "ta demande de retrait est refusée", transactional: true,
        text: accepted
          ? `« ${doc.title} » n’est plus en ligne : il redevient un brouillon dans Mes documents.${response ? `\n\nMot de l’administration : ${response}` : ""}`
          : `« ${doc.title} » reste en ligne.\n\nMotif : ${response}`,
        action: accepted ? "Ouvrir le brouillon" : "Voir le cours",
      },
    });
  }
  forgetAllShellCounters();
  revalidatePath(`/d/${doc.id}`);
  revalidatePath("/admin/moderation");
  revalidatePath("/admin");
  return { ok: decision === "accept" ? "Cours retiré de la publication" : "Demande refusée" };
}
