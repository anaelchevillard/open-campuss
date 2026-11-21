import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { apiMember } from "@/lib/auth";
import { forgetPages, pagesCache, pagesKey } from "@/lib/connected/pages-cache";
import { ConnectionLost, PROVIDERS } from "@/lib/connected/providers";
import { editedAgo, isProvider } from "@/lib/connected/rules";
import { accessTokenOf } from "@/lib/connected/scan";
import { folderOf, importProviders } from "@/lib/connected/status";
import { db, schema } from "@/lib/db";
import { json, notFoundResponse } from "@/lib/http";
import { rateHit, rateLimited } from "@/lib/security";

/** Pages ou documents du compte relié, pour le sélecteur. `lost` : il faut reconnecter. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const user = await apiMember();
  const { provider } = await params;
  if (!user || !isProvider(provider) || !(await importProviders()).includes(provider)) return notFoundResponse();
  const folder = await folderOf(user.id, provider);
  if (!folder) return json({ connected: false, items: [], next: null });
  if (folder.brokenAt) return json({ connected: true, lost: true, items: [], next: null });
  const key = `picker:${user.id}`;
  if (await rateLimited(key, 300, 60)) return json({ error: "Trop de recherches. Réessaie dans un instant." }, 429);
  await rateHit(key);
  const query = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
  const cursor = request.nextUrl.searchParams.get("cursor")?.slice(0, 500) || null;
  try {
    const page = await pagesCache.getOrLoad(pagesKey(user.id, provider, query, cursor), async () => PROVIDERS[provider].search(await accessTokenOf(folder), query, cursor));
    const ids = page.items.map((item) => item.id);
    const imported = ids.length ? await db.select({ id: schema.connectedItems.externalId }).from(schema.connectedItems)
      .where(and(eq(schema.connectedItems.folderId, folder.id), inArray(schema.connectedItems.externalId, ids), eq(schema.connectedItems.status, "shared"), isNotNull(schema.connectedItems.documentId))) : [];
    const done = new Set(imported.map((row) => row.id));
    const now = Date.now();
    return json({
      connected: true,
      items: page.items.map((item) => ({ id: item.id, title: item.title, editedAt: item.editedAt, edited: editedAgo(item.editedAt, now), icon: item.icon, imported: done.has(item.id) })),
      next: page.next,
    });
  } catch (error) {
    if (error instanceof ConnectionLost) {
      await db.update(schema.connectedFolders).set({ brokenAt: new Date() }).where(eq(schema.connectedFolders.id, folder.id));
      forgetPages(user.id, provider);
      return json({ connected: true, lost: true, items: [], next: null });
    }
    console.warn("sélecteur :", (error as Error).message);
    return json({ error: "La liste n’a pas pu être lue. Réessaie dans un instant." }, 502);
  }
}
