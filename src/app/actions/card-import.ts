"use server";

import { trackEvent } from "@/lib/product-events";
import { and, count, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { canRead } from "@/lib/access-server";
import { requireUser } from "@/lib/auth";
import { importPayload, withoutDuplicates } from "@/lib/card-import";
import { db, schema } from "@/lib/db";
import { FREE_SCOPE } from "@/lib/memo-pack-rules";
import { rateHit, rateLimited } from "@/lib/security";
import { forgetShellCounters } from "@/lib/shell-cache";

const { documents, flashcards } = schema;

/** Plafond de fiches d'un compte : un import ne fait pas grossir la base sans fin. */
const MAX_USER_CARDS = 20_000;
const IMPORTS_PER_DAY = 10;
const CHUNK = 500;

export type ImportOutcome = { ok: string; added: number; skipped: number; scope: string } | { error: string };

/**
 * Import de fiches : le navigateur lit et prévisualise le fichier, le serveur revalide tout (zod :
 * 1 000 fiches, 2 Mo, longueurs), vérifie le cours, la limite du jour et le plafond du compte, puis écarte les doublons.
 */
export async function importCards(raw: unknown): Promise<ImportOutcome> {
  const user = await requireUser();
  const parsed = importPayload.safeParse(raw);
  if (!parsed.success) return { error: "Import refusé : 1 000 fiches et 2 Mo au plus, recto et verso remplis (1 000 et 2 000 caractères au plus)." };
  const { scope, cards } = parsed.data;
  if (scope !== FREE_SCOPE) {
    const [doc] = await db.select().from(documents).where(eq(documents.id, scope));
    if (!doc || doc.deletedAt || !(await canRead(user, doc))) return { error: "Ce cours n’est pas accessible." };
  }
  const key = `cards-import:${user.id}`;
  if (await rateLimited(key, IMPORTS_PER_DAY, 1440)) return { error: "Trop d’imports aujourd’hui : réessaie demain." };
  const inScope = and(eq(flashcards.userId, user.id), scope === FREE_SCOPE ? isNull(flashcards.documentId) : eq(flashcards.documentId, scope));
  const [[owned], existing] = await Promise.all([
    db.select({ n: count() }).from(flashcards).where(eq(flashcards.userId, user.id)),
    db.select({ front: flashcards.front, back: flashcards.back }).from(flashcards).where(inScope),
  ]);
  const fresh = withoutDuplicates(cards, existing);
  if (owned.n + fresh.length > MAX_USER_CARDS) return { error: `Ton compte peut garder ${MAX_USER_CARDS.toLocaleString("fr-FR")} fiches au plus.` };
  await rateHit(key);
  const documentId = scope === FREE_SCOPE ? null : scope;
  if (fresh.length) {
    await db.transaction(async (tx) => {
      for (let i = 0; i < fresh.length; i += CHUNK) await tx.insert(flashcards).values(fresh.slice(i, i + CHUNK).map((card) => ({ userId: user.id, documentId, front: card.front, back: card.back })));
    });
  }
  if (fresh.length) await trackEvent("cards_imported", user);
  forgetShellCounters(user.id);
  revalidatePath("/reviser");
  revalidatePath("/reviser/fiches");
  const skipped = cards.length - fresh.length;
  const word = (n: number) => `${n} fiche${n > 1 ? "s" : ""}`;
  return { ok: fresh.length ? `${word(fresh.length)} importée${fresh.length > 1 ? "s" : ""}${skipped ? `, ${skipped} déjà présente${skipped > 1 ? "s" : ""}` : ""}.` : "Toutes ces fiches sont déjà dans ce paquet.", added: fresh.length, skipped, scope };
}
