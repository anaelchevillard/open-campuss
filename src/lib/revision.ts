import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "./db";

const { revisionSpaces, revisionMembers } = schema;

/** La seule règle d'accès aux annotations : le propriétaire, ou une invitation acceptée. */
export async function revisionAccess(spaceId: string, userId: string) {
  const [space] = await db.select().from(revisionSpaces).where(eq(revisionSpaces.id, spaceId));
  if (!space) return null;
  if (space.ownerId === userId) return { space, owner: true };
  const [member] = await db.select().from(revisionMembers).where(and(eq(revisionMembers.spaceId, spaceId), eq(revisionMembers.userId, userId), eq(revisionMembers.status, "accepted")));
  return member ? { space, owner: false } : null;
}
