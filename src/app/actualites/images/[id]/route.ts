import type { Readable } from "node:stream";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { blogFileVisible, blogKey } from "@/lib/blog";
import { nodeToWeb, notFoundResponse } from "@/lib/http";
import { getObject } from "@/lib/s3";

/** Image d'une actualité : publique une fois l'actualité publiée, sinon réservée à l'administrateur. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return notFoundResponse();
  const user = await currentUser();
  const file = await blogFileVisible(id.data, user?.role === "admin");
  if (!file) return notFoundResponse();
  const object = await getObject(blogKey(file.id));
  if (!object?.Body) return notFoundResponse();
  return new Response(nodeToWeb(object.Body as Readable), { headers: {
    "Content-Type": file.inlineType, "Content-Length": String(file.size), "Cache-Control": "public, max-age=3600",
    "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'",
  } });
}
