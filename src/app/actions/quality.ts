"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/action-form";
import { canModerate } from "@/lib/access";
import { canRead } from "@/lib/access-server";
import { audit, requireModerator, requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { MemoError, regenerateDeck } from "@/lib/memo";
import { cardKey } from "@/lib/memo-cards";
import { rateHit, rateLimited } from "@/lib/security";
import { forgetAllShellCounters } from "@/lib/shell-cache";

const { documents, memoCardReports, memoDecks } = schema;

const uuid = z.uuid();

async function readable(rawId: string) {
  const user = await requireUser();
  const id = uuid.parse(rawId);
  const [doc] = await db.select({ id: documents.id, kind: documents.kind, programId: documents.programId, published: documents.published, createdBy: documents.createdBy, subjectId: documents.subjectId, hiddenByReports: documents.hiddenByReports, reviewRequested: documents.reviewRequested }).from(documents).where(eq(documents.id, id));
  if (!doc || !(await canRead(user, doc))) throw new Error("accès refusé");
  return { user, doc };
}

async function moderated(form: FormData) {
  const user = await requireModerator();
  const id = uuid.parse(form.get("id"));
  const [doc] = await db.select({ id: documents.id, title: documents.title, programId: documents.programId, reviewedAt: documents.reviewedAt, published: documents.published }).from(documents).where(eq(documents.id, id));
  if (!doc || !canModerate(user, doc)) throw new Error("accès refusé");
  return { user, doc };
}

/** Un compte ne pèse qu'une fois sur une fiche, sans garder qui a signalé : les modérateurs jugent la fiche, pas la personne. */
export async function reportMemoCard(rawId: string, front: string): Promise<{ error?: string }> {
  const { user, doc } = await readable(rawId);
  const [deck] = await db.select({ cards: memoDecks.cards }).from(memoDecks).where(eq(memoDecks.documentId, doc.id));
  const card = deck?.cards.find((c) => c.front === front);
  if (!card) return {};
  const key = cardKey(card.front);
  const mine = `memo-report:${user.id}:${doc.id}:${key}`;
  if (await rateLimited(mine, 1, 2880)) return {};
  const pace = `memo-reports:${user.id}`;
  if (await rateLimited(pace, 30, 60)) return { error: "Trop de signalements d’un coup. Réessaie plus tard." };
  await Promise.all([rateHit(mine), rateHit(pace)]);
  await db.insert(memoCardReports).values({ documentId: doc.id, cardKey: key, front: card.front, back: card.back }).onConflictDoUpdate({
    target: [memoCardReports.documentId, memoCardReports.cardKey],
    // Une fiche qu'un modérateur a déjà gardée ne revient pas à chaque nouveau signalement ; après une régénération, c'est une autre fiche
    set: {
      front: card.front, back: card.back, updatedAt: new Date(),
      reports: sql`case when ${memoCardReports.status} = 'replaced' then 1 else ${memoCardReports.reports} + 1 end`,
      status: sql`case when ${memoCardReports.status} = 'replaced' then 'open' else ${memoCardReports.status} end`,
    },
  });
  forgetAllShellCounters();
  return {};
}

/** Les fiches déjà copiées dans les révisions d'un étudiant vivent dans une autre table : elles restent à lui. */
export async function removeMemoCard(form: FormData) {
  const { user, doc } = await moderated(form);
  const key = z.string().length(32).parse(form.get("card"));
  await db.transaction(async (tx) => {
    const [deck] = await tx.select({ cards: memoDecks.cards }).from(memoDecks).where(eq(memoDecks.documentId, doc.id)).for("update");
    if (deck) await tx.update(memoDecks).set({ cards: deck.cards.filter((c) => cardKey(c.front) !== key) }).where(eq(memoDecks.documentId, doc.id));
    await tx.update(memoCardReports).set({ status: "removed", updatedAt: new Date() }).where(and(eq(memoCardReports.documentId, doc.id), eq(memoCardReports.cardKey, key)));
  });
  forgetAllShellCounters();
  await audit(user.email, "fiche_ia_retirée", doc.title);
  revalidatePath("/moderation");
  revalidatePath(`/d/${doc.id}`);
}

export async function keepMemoCard(form: FormData) {
  const { user, doc } = await moderated(form);
  const key = z.string().length(32).parse(form.get("card"));
  await db.update(memoCardReports).set({ status: "kept", updatedAt: new Date() }).where(and(eq(memoCardReports.documentId, doc.id), eq(memoCardReports.cardKey, key)));
  forgetAllShellCounters();
  await audit(user.email, "fiche_ia_gardée", doc.title);
  revalidatePath("/moderation");
}

export async function regenerateMemoDeck(_: FormState, form: FormData): Promise<FormState> {
  const { user, doc } = await moderated(form);
  if (!env.aiApiKey) return { error: "Campuss IA n’est pas activée sur ce site." };
  const byUser = `memo-regen:${user.id}`;
  const byDoc = `memo-regen-doc:${doc.id}`;
  if (await rateLimited(byUser, 10, 1440) || await rateLimited(byDoc, 3, 1440)) return { error: "Assez de régénérations pour aujourd’hui. Réessaie demain." };
  await Promise.all([rateHit(byUser), rateHit(byDoc)]);
  try {
    await regenerateDeck(doc.id);
  } catch (error) {
    if (error instanceof MemoError) return { error: error.message };
    console.warn("fiches mémo :", (error as Error).message);
    return { error: "Campuss IA n’a pas réussi cette fois. Le paquet reste tel quel." };
  }
  forgetAllShellCounters();
  await audit(user.email, "fiches_ia_régénérées", doc.title);
  revalidatePath("/moderation");
  revalidatePath(`/d/${doc.id}`);
  return { ok: "Le paquet est régénéré." };
}

/** Pour un cours en ligne qui n’a pas eu de relecture (import ancien, ancienne publication directe). */
export async function markReviewed(form: FormData) {
  const { user, doc } = await moderated(form);
  if (!doc.published || doc.reviewedAt) return;
  await db.update(documents).set({ postReviewAt: null, reviewedBy: user.id, reviewedAt: new Date() }).where(eq(documents.id, doc.id));
  await audit(user.email, "document_relu", doc.title);
  revalidatePath(`/d/${doc.id}`);
}

/** Le « … » de la file Fiches IA : même garde que le formulaire, sans état de formulaire. */
export async function regenerateDeckNow(rawId: string): Promise<{ ok?: string; error?: string }> {
  const form = new FormData();
  form.set("id", uuid.parse(rawId));
  const result = await regenerateMemoDeck(null, form);
  return { ok: result?.ok, error: result?.error };
}
