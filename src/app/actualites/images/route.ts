import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiMember } from "@/lib/auth";
import { blogKey } from "@/lib/blog";
import { cleanFilename, sniffInline } from "@/lib/content-utils";
import { db, schema } from "@/lib/db";
import { json } from "@/lib/http";
import { cleanImage, ImageRejected, nameForType } from "@/lib/image-clean";
import { putObject } from "@/lib/s3";
import { rateHit, rateLimited } from "@/lib/security";

const MAX_IMAGE = 8 * 1024 * 1024;
const decodeName = (raw: string | null) => { try { return decodeURIComponent(raw ?? ""); } catch { return ""; } };

/** Image insérée dans une actualité (administrateur) : nettoyée, puis servie publiquement avec l'actualité. */
export async function POST(request: NextRequest) {
  const user = await apiMember();
  const id = z.uuid().safeParse(request.nextUrl.searchParams.get("post"));
  if (!user || user.role !== "admin" || user.mustChangePassword || !id.success) return json({ error: "Accès refusé" }, 403);
  const [post] = await db.select({ id: schema.blogPosts.id }).from(schema.blogPosts).where(eq(schema.blogPosts.id, id.data));
  if (!post) return json({ error: "Accès refusé" }, 403);
  const key = `blog-image:${user.id}`;
  if (await rateLimited(key, 100, 60)) return json({ error: "Trop d’images envoyées. Réessaie plus tard." }, 429);
  if (Number(request.headers.get("content-length")) > MAX_IMAGE) return json({ error: "Image trop lourde (8 Mo maximum)." }, 413);
  const received = Buffer.from(await request.arrayBuffer());
  if (received.length > MAX_IMAGE) return json({ error: "Image trop lourde (8 Mo maximum)." }, 413);
  if (!sniffInline(received.subarray(0, 16))?.startsWith("image/")) return json({ error: "Seules les images PNG, JPEG et WebP sont acceptées." }, 415);
  await rateHit(key);
  let cleaned;
  try { cleaned = await cleanImage(received); } catch (error) {
    if (error instanceof ImageRejected) return json({ error: error.message }, 415);
    throw error;
  }
  const filename = nameForType(cleanFilename(decodeName(request.headers.get("x-filename")) || "image"), cleaned.inlineType);
  const [file] = await db.insert(schema.blogFiles).values({ postId: post.id, filename, size: cleaned.buffer.length, inlineType: cleaned.inlineType }).returning();
  await putObject(blogKey(file.id), cleaned.buffer, "application/octet-stream");
  if (request.nextUrl.searchParams.get("cover") === "1") await db.update(schema.blogPosts).set({ coverFileId: file.id }).where(eq(schema.blogPosts.id, post.id));
  return json({ url: `/actualites/images/${file.id}` });
}
