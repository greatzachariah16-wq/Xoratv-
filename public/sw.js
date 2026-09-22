// Monetag Multitag Service Worker Configuration
self.options = {
  domain: "3nbf4.com",
  zoneId: 11865683,
};
self.lary = "";

try {
  importScripts("https://3nbf4.com/act/files/service-worker.min.js?r=sw");
} catch (err) {
  // Graceful handling if offline or network failure
}

// Clean minimal service worker for Xora (PWA lifecycle & caching)
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
