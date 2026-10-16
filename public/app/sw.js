/* Build substitutes the exact asset list and content version. */
const CACHE_PREFIX = "odessa-poker-app-";
const CACHE = CACHE_PREFIX + "869399e0e3687404";
const SHELL = "/app/index.html";
const ASSETS = ["/app/assets/index-4NNFMxk3.js","/app/assets/index-Bft6shFs.css","/app/assets/inter-cyrillic-400-normal-HOLc17fK.woff","/app/assets/inter-cyrillic-400-normal-obahsSVq.woff2","/app/assets/inter-cyrillic-600-normal-4D_pXhcN.woff","/app/assets/inter-cyrillic-600-normal-CWCymEST.woff2","/app/assets/inter-latin-400-normal-C38fXH4l.woff2","/app/assets/inter-latin-400-normal-CyCys3Eg.woff","/app/assets/inter-latin-600-normal-CiBQ2DWP.woff","/app/assets/inter-latin-600-normal-LgqL8muc.woff2","/app/assets/jetbrains-mono-cyrillic-400-normal-BEIGL1Tu.woff2","/app/assets/jetbrains-mono-cyrillic-400-normal-ugxPyKxw.woff","/app/assets/jetbrains-mono-latin-400-normal-6-qcROiO.woff","/app/assets/jetbrains-mono-latin-400-normal-V6pRDFza.woff2","/app/assets/oswald-cyrillic-500-normal-CjKr_ZfC.woff","/app/assets/oswald-cyrillic-500-normal-Dz4ZC46J.woff2","/app/assets/oswald-latin-500-normal-B-eyT0Dw.woff2","/app/assets/oswald-latin-500-normal-DM85Di4w.woff","/app/assets/web-Bc0I6abs.js","/app/assets/web-D4wUIyuA.js","/app/assets/web-D5kn2rqd.js","/app/assets/web-_WSnVBdH.js","/app/icons/icon-180.png","/app/icons/icon-192.png","/app/icons/icon-512.png","/app/icons/icon.svg","/app/index.html","/app/manifest.webmanifest"];
const allowed = new Set(ASSETS);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" })));
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
    // Do not skipWaiting: a new bundle must not interrupt a game.
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Keep previous hashed chunks for tabs still running the previous version.
    const old = (await caches.keys()).filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE);
    await Promise.all(old.slice(0, -1).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") event.waitUntil(self.skipWaiting());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Network-only for game actions, microphone signaling, sessions and tournament data.
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith("/app/")) return;
  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      return await cache.match(SHELL) || fetch(event.request);
    })());
    return;
  }
  if (!allowed.has(url.pathname)) {
    // Old immutable chunks may still be requested by an already open tab.
    if (/^\/app\/assets\/[^/]+\.(?:js|css|woff2?)$/.test(url.pathname)) {
      event.respondWith(caches.match(url.pathname).then((cached) => cached || fetch(event.request)));
    }
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(url.pathname) || fetch(event.request);
  })());
});
