import { eq } from "drizzle-orm";
import type { Readable } from "node:stream";
import { z } from "zod";
import { canRead } from "@/lib/access-server";
import { currentUser } from "@/lib/auth";
import { mimeOf } from "@/lib/content-utils";
import { db, schema } from "@/lib/db";
import { nodeToWeb, notFoundResponse } from "@/lib/http";
import { getObject, versionPrefix } from "@/lib/s3";

const INLINE = /^image\/(png|jpeg|gif|webp|avif)$|^(video|audio)\//;

export async function GET(_: Request, { params }: { params: Promise<{ doc: string; version: string; name: string }> }) {
  const user = await currentUser();
  if (!user) return notFoundResponse();
  const { doc: docId, version, name } = await params;
  if (!z.uuid().safeParse(docId).success || !z.uuid().safeParse(version).success || !/^[0-9a-f-]{36}(\.[a-z0-9]{1,10})?$/.test(name)) {
    return notFoundResponse();
  }
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, docId));
  if (!doc || doc.contentVersion !== version || !(await canRead(user, doc))) return notFoundResponse();
  const object = await getObject(`${versionPrefix(docId, version)}assets/${name}`);
  if (!object?.Body) return notFoundResponse();
  // Ces pièces s'affichent sur l'origine du site : seuls images et médias passent, le reste est téléchargé
  const type = mimeOf(name);
  const inline = INLINE.test(type);
  return new Response(nodeToWeb(object.Body as Readable), {
    headers: {
      "Content-Type": inline ? type : "application/octet-stream",
      ...(inline ? {} : { "Content-Disposition": "attachment" }),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
