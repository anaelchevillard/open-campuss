"use server";

import { trackEvent } from "@/lib/product-events";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canRead } from "@/lib/access-server";
import { aiRefusalFor, reserveAi } from "@/lib/ai-quota-server";
import { MemoError, memoCardsFor } from "@/lib/memo";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";



/** Fiches proposées par Campuss IA : sauvegardées une fois pour le cours, ajoutées ensuite au paquet de chacun. */
export async function generateMemoCards(rawId: string): Promise<{ cards: { front: string; back: string }[] } | { error: string }> {
  const user = await requireUser();
  const id = z.uuid().parse(rawId);
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, id));
  if (!doc || !(await canRead(user, doc))) return { error: "Accès refusé." };
  const [cached] = await db.select().from(schema.memoDecks).where(eq(schema.memoDecks.documentId, id));
  if (cached) return { cards: cached.cards };
  // Un cours déjà généré ne coûte rien : le quota ne compte que les vrais appels
  const reservation = await reserveAi(user, "memo");
  if (!reservation.ok) return { error: aiRefusalFor("memo", reservation) };
  try {
    return { cards: await memoCardsFor(id) };
  } catch (error) {
    await reservation.release();
    if (error instanceof MemoError) return { error: error.message };
    console.warn("fiches mémo :", (error as Error).message);
    return { error: "Campuss IA n’a pas réussi cette fois. Réessaie dans un instant." };
  }
}

export async function addMemoCards(rawId: string, cards: { front: string; back: string }[]) {
  const user = await requireUser();
  const id = z.uuid().parse(rawId);
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, id));
  if (!doc || !(await canRead(user, doc))) return { added: 0 };
  // Seules les fiches sauvegardées pour ce cours peuvent être ajoutées
  const [deck] = await db.select().from(schema.memoDecks).where(eq(schema.memoDecks.documentId, id));
  const allowed = new Set((deck?.cards ?? []).map((c) => c.front));
  const picked = (deck?.cards ?? []).filter((c) => allowed.has(c.front) && cards.some((other) => other.front === c.front));
  const existing = new Set((await db.select({ front: schema.flashcards.front }).from(schema.flashcards).where(and(eq(schema.flashcards.userId, user.id), eq(schema.flashcards.documentId, id)))).map((c) => c.front));
  const fresh = picked.filter((c) => !existing.has(c.front));
  if (fresh.length) await db.insert(schema.flashcards).values(fresh.map((c) => ({ userId: user.id, documentId: id, front: c.front, back: c.back })));
  if (fresh.length) await trackEvent("card_created", user);
  revalidatePath("/reviser");
  return { added: fresh.length };
}
