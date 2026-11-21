// Lecture hors ligne : uniquement les cours que l'étudiant a choisi de garder, effacés à la déconnexion.
const PAGES = "campuss-pages-v1";
const ASSETS = "campuss-assets-v1";
const SHARED = "campuss-partage-v1";
const MAX_SHARED_FILES = 20;

// Partage depuis le téléphone : le fichier reste sur l'appareil jusqu'à ce que la page du brouillon l'importe, avec les mêmes
// routes et les mêmes contrôles qu'un dépôt ordinaire. Aucune route serveur n'a donc à accepter un POST sans jeton d'origine.
async function receiveShare(request) {
  try {
    const referrer = request.referrer ? new URL(request.referrer).origin : location.origin;
    if (referrer !== location.origin) throw new Error("autre site");
    const files = (await request.formData()).getAll("files").filter((file) => file instanceof File && file.size > 0).slice(0, MAX_SHARED_FILES);
    if (!files.length) throw new Error("rien à importer");
    await caches.delete(SHARED);
    const cache = await caches.open(SHARED);
    let index = 0;
    for (const file of files) {
      await cache.put(`/partage/${index++}`, new Response(file, { headers: { "content-type": file.type || "application/octet-stream", "x-name": encodeURIComponent(file.name), "x-at": String(Date.now()) } }));
    }
    return Response.redirect("/contribuer/nouveau?partage=1", 303);
  } catch {
    return Response.redirect("/contribuer/nouveau?importer=1", 303);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(ASSETS).then((cache) => cache.add("/hors-ligne")).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
  const { type, path } = event.data ?? {};
  const port = event.ports[0];
  // Déconnexion : plus rien ne doit arriver sur cet appareil, peut-être partagé. Le service de push répondra 410 et le serveur oubliera l'abonnement.
  if (type === "clear") event.waitUntil(Promise.all([caches.delete(PAGES), caches.delete(SHARED), self.registration.pushManager?.getSubscription().then((subscription) => subscription?.unsubscribe())]));
  if (type === "save-page" && /^\/d\/[0-9a-f-]{36}$/.test(path)) {
    event.waitUntil(fetch(path, { credentials: "same-origin" }).then(async (response) => {
      if (!response.ok || response.redirected) throw new Error("page indisponible");
      await (await caches.open(PAGES)).put(path, response);
      port?.postMessage({ ok: true });
    }).catch(() => port?.postMessage({ ok: false })));
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.origin === location.origin && url.pathname === "/partage") {
    event.respondWith(receiveShare(event.request));
    return;
  }
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(caches.open(ASSETS).then(async (cache) => {
      const hit = await cache.match(event.request);
      if (hit) return hit;
      const response = await fetch(event.request);
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    }));
    return;
  }
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(async () => (await (await caches.open(PAGES)).match(url.pathname)) ?? (await (await caches.open(ASSETS)).match("/hors-ligne"))));
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { /* message illisible : on affiche quand même quelque chose, le navigateur l'exige */ }
  event.waitUntil(self.registration.showNotification(data.title || "Campuss", { body: data.body || "", icon: "/icon-192.png", tag: data.tag, data: { url: data.url || "/accueil" } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/accueil", location.origin);
  const url = target.origin === location.origin ? target.href : location.origin;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
    const open = windows[0];
    if (open?.navigate) {
      await open.focus();
      return open.navigate(url).catch(() => self.clients.openWindow(url));
    }
    return self.clients.openWindow(url);
  }));
});

// Le navigateur renouvelle parfois l'abonnement de lui-même : sans ce relais, l'appareil cesserait de recevoir sans que personne le sache
self.addEventListener("pushsubscriptionchange", (event) => {
  const applicationServerKey = event.oldSubscription?.options?.applicationServerKey;
  if (!applicationServerKey) return;
  event.waitUntil(self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey }).then((subscription) => fetch("/api/account/push", {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()),
  })));
});
