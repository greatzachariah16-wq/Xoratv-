// Clean minimal PWA service worker for XoraTV
const CACHE_NAME = "xora-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Let standard network requests proceed normally
});
