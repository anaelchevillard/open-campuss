import { eq } from "drizzle-orm";
import type { Readable } from "node:stream";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { nodeToWeb, notFoundResponse } from "@/lib/http";
import { canViewProfile } from "@/lib/people";
import { getObject } from "@/lib/s3";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await currentUser();
  const id = z.uuid().safeParse((await params).id);
  if (!viewer || !id.success) return notFoundResponse();
  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, id.data));
  if (!target?.avatarKey || !(await canViewProfile(viewer, target))) return notFoundResponse();
  const object = await getObject(target.avatarKey);
  if (!object?.Body) return notFoundResponse();
  return new Response(nodeToWeb(object.Body as Readable), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" },
  });
}
