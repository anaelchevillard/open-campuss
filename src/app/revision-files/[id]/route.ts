import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { revisionAccess } from "@/lib/revision";
import { getObject, revisionKey } from "@/lib/s3";

const missing = () => new Response("Introuvable", { status: 404 });

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  const id = z.uuid().safeParse((await params).id);
  if (!user || user.mustChangePassword || !id.success) return missing();
  const [file] = await db.select().from(schema.revisionFiles).where(eq(schema.revisionFiles.id, id.data));
  if (!file || !(await revisionAccess(file.spaceId, user.id))) return missing();
  const object = await getObject(revisionKey(file.id));
  if (!object?.Body) return missing();
  return new Response(await object.Body.transformToByteArray() as BodyInit, { headers: {
    "Content-Type": file.inlineType, "Content-Length": String(file.size), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'self'",
  } });
}
