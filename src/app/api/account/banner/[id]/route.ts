import { eq } from "drizzle-orm";
import type { Readable } from "node:stream";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { isBlockedBetween } from "@/lib/friends";
import { nodeToWeb, notFoundResponse } from "@/lib/http";
import { canViewProfile } from "@/lib/people";
import { getObject } from "@/lib/s3";
import { featureOn } from "@/lib/site-settings";

/** Même règle que la photo : visible seulement de qui peut voir le profil. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await currentUser();
  const id = z.uuid().safeParse((await params).id);
  if (!viewer || !id.success) return notFoundResponse();
  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, id.data));
  if (!target || !(await canViewProfile(viewer, target)) || (viewer.id !== target.id && await isBlockedBetween(viewer.id, target.id))) return notFoundResponse();
  if (viewer.id !== target.id && !(await featureOn("bannerImages"))) return notFoundResponse();
  const [profile] = await db.select({ banner: schema.userProfiles.banner }).from(schema.userProfiles).where(eq(schema.userProfiles.userId, target.id));
  const key = profile?.banner?.kind === "image" ? profile.banner.key : undefined;
  if (!key) return notFoundResponse();
  const object = await getObject(key);
  if (!object?.Body) return notFoundResponse();
  return new Response(nodeToWeb(object.Body as Readable), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" },
  });
}
