import "server-only";
import { and, count, desc, eq, ilike, inArray, isNull, max, or, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { areFriends, friendsOf } from "./friends";
import { canSeePack, FREE_SCOPE, MAX_PACK_CARDS, type PackViewer } from "./memo-pack-rules";
import { shortName } from "./user-name-rules";

const { flashcards, documents, memoPacks, users } = schema;

export type Pack = typeof memoPacks.$inferSelect;

const scopeFilter = (ownerId: string, scope: string) =>
  and(eq(flashcards.userId, ownerId), scope === FREE_SCOPE ? isNull(flashcards.documentId) : eq(flashcards.documentId, scope));

/** Mes paquets : mes fiches regroupées par cours (ou libres), avec leur partage. */
export async function myPacks(userId: string) {
  const [groups, packs] = await Promise.all([
    db.select({ documentId: flashcards.documentId, title: max(documents.title), n: count() }).from(flashcards).leftJoin(documents, eq(flashcards.documentId, documents.id))
      .where(eq(flashcards.userId, userId)).groupBy(flashcards.documentId),
    db.select().from(memoPacks).where(eq(memoPacks.ownerId, userId)),
  ]);
  const byScope = new Map(packs.map((p) => [p.scope, p]));
  return groups.map((g) => {
    const scope = g.documentId ?? FREE_SCOPE;
    return { scope, title: g.documentId ? g.title || "Sans titre" : "Fiches libres", n: g.n, pack: byScope.get(scope) ?? null };
  }).sort((a, b) => b.n - a.n);
}

export async function packCards(pack: Pick<Pack, "ownerId" | "scope">) {
  return db.select({ front: flashcards.front, back: flashcards.back }).from(flashcards).where(scopeFilter(pack.ownerId, pack.scope)).orderBy(flashcards.createdAt).limit(MAX_PACK_CARDS);
}

export async function cardCount(pack: Pick<Pack, "ownerId" | "scope">) {
  const [row] = await db.select({ n: count() }).from(flashcards).where(scopeFilter(pack.ownerId, pack.scope));
  return row.n;
}

/** Le paquet s'il est lisible par cette personne, sinon null (même réponse qu'un paquet inexistant). */
export async function readablePack(viewer: PackViewer, id: string) {
  const [pack] = await db.select().from(memoPacks).where(eq(memoPacks.id, id));
  if (!pack) return null;
  const friend = pack.friends && viewer.id !== pack.ownerId ? await areFriends(viewer.id, pack.ownerId) : false;
  return canSeePack(viewer, pack, friend) ? pack : null;
}

const listColumns = { pack: memoPacks, owner: users.name, cards: sql<number>`(select count(*)::int from ${flashcards} f where f.user_id = ${memoPacks.ownerId} and (case when ${memoPacks.scope} = ${FREE_SCOPE} then f.document_id is null else f.document_id::text = ${memoPacks.scope} end))` };

/** Bibliothèque publique de la licence : recherche par titre, les plus copiés d'abord. */
export async function publicPacks(viewer: PackViewer, query: string, documentId?: string) {
  if (viewer.role !== "admin" && !viewer.programId) return [];
  const term = query.trim().slice(0, 80).replace(/[\\%_]/g, (c) => `\\${c}`);
  const rows = await db.select(listColumns).from(memoPacks).innerJoin(users, eq(memoPacks.ownerId, users.id))
    .where(and(eq(memoPacks.public, true), isNull(memoPacks.removedAt), eq(users.status, "active"), viewer.role === "admin" ? undefined : eq(memoPacks.programId, viewer.programId!), term ? ilike(memoPacks.title, `%${term}%`) : undefined, documentId ? eq(memoPacks.documentId, documentId) : undefined))
    .orderBy(desc(memoPacks.copies), desc(memoPacks.updatedAt)).limit(60);
  return rows.filter((r) => r.cards > 0).map((r) => ({ ...r, owner: r.pack.ownerId === viewer.id ? "Toi" : shortName(r.owner) }));
}

/** Les paquets que mes amis m'ont partagés (ceux d'un cours seulement avec `documentId`). */
export async function friendPacks(viewer: PackViewer, documentId?: string) {
  const friends = await friendsOf(viewer.id);
  if (!friends.length) return [];
  const rows = await db.select(listColumns).from(memoPacks).innerJoin(users, eq(memoPacks.ownerId, users.id))
    .where(and(inArray(memoPacks.ownerId, friends.map((f) => f.id)), isNull(memoPacks.removedAt), documentId ? eq(memoPacks.documentId, documentId) : undefined, or(eq(memoPacks.friends, true), and(eq(memoPacks.public, true), eq(memoPacks.programId, viewer.programId ?? -1)))))
    .orderBy(desc(memoPacks.updatedAt)).limit(60);
  return rows.filter((r) => r.cards > 0);
}
