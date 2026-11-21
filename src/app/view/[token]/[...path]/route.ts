import { eq } from "drizzle-orm";
import type { Readable } from "node:stream";
import { canRead } from "@/lib/access-server";
import { env } from "@/lib/env";
import { mimeOf, safeRelativePath } from "@/lib/content-utils";
import { db, schema } from "@/lib/db";
import { getObject, versionPrefix } from "@/lib/s3";
import { parseViewToken } from "@/lib/security";
import { nodeToWeb, notFoundResponse, SANDBOX_POLICY } from "@/lib/http";

export async function GET(_: Request, { params }: { params: Promise<{ token: string; path: string[] }> }) {
  const { token, path } = await params;
  const parsed = parseViewToken(decodeURIComponent(token));
  if (!parsed) return notFoundResponse();

  let relative: string | null;
  try {
    relative = safeRelativePath(path.map((part) => decodeURIComponent(part)).join("/"));
  } catch {
    return notFoundResponse();
  }
  if (!relative) return notFoundResponse();

  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, parsed.docId));
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, parsed.userId));
  // Révocation immédiate : un compte désactivé ou suspendu perd l'accès malgré un jeton encore valide
  const suspended = Boolean(user?.suspendedUntil && user.suspendedUntil > new Date());
  if (!doc?.contentVersion || user?.status !== "active" || suspended || !(await canRead(user, doc))) return notFoundResponse();

  const object = await getObject(versionPrefix(doc.id, doc.contentVersion) + relative);
  if (!object?.Body) return notFoundResponse();
  const type = mimeOf(relative);
  const common = {
      "Content-Type": type,
      "Content-Security-Policy": `sandbox ${SANDBOX_POLICY}; frame-ancestors ${new URL(env.baseUrl).origin}`,
      // Origine opaque : l'autorisation est dans l'URL, jamais dans un cookie
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
  };
  // Le stockage de remplacement est injecté dans chaque page HTML, avant son propre code
  if (type.startsWith("text/html") && (object.ContentLength ?? 0) < 20_000_000) {
    const html = await object.Body.transformToString("utf-8");
    const shim = `<script src="/vendor/storage-shim.js"></script>`;
    const withShim = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (tag) => tag + shim) : shim + html;
    return new Response(withShim, { headers: common });
  }
  return new Response(nodeToWeb(object.Body as Readable), { headers: { ...common, ...(object.ContentLength ? { "Content-Length": String(object.ContentLength) } : {}) } });
}
