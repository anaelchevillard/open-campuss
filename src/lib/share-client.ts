// Le service worker (public/sw.js) dépose ici ce qui arrive par le menu de partage du téléphone
const SHARED_CACHE = "campuss-partage-v1";
const MAX_AGE_MS = 60 * 60_000;

/** Lit et vide le dépôt. Un partage trop ancien n'est pas repris : il a pu être fait sur un autre compte. */
export async function takeSharedFiles(): Promise<File[]> {
  if (typeof caches === "undefined") return [];
  const cache = await caches.open(SHARED_CACHE);
  const keys = await cache.keys();
  const files: File[] = [];
  for (const key of keys) {
    const response = await cache.match(key);
    if (!response || Date.now() - Number(response.headers.get("x-at")) > MAX_AGE_MS) continue;
    let name = "";
    try { name = decodeURIComponent(response.headers.get("x-name") ?? ""); } catch { /* nom illisible */ }
    files.push(new File([await response.blob()], name || "partage", { type: response.headers.get("content-type") ?? "" }));
  }
  await caches.delete(SHARED_CACHE);
  return files;
}
