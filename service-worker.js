// This is the template for your service worker.
// The build script will read this file, fill in the placeholders,
// and create the final 'service-worker.js' file.

const CACHE_NAME = 'jlpt-handbook-cache-v1.0.2';
const urlsToCache = [
  "/",
  "/index.html",
  "/offline.html",
  "/dist/main.min.css",
  "/dist/deferred.min.css",
  "/assets/siteIcon.webp",
  "/assets/siteIcon.png",
  "/assets/og.png",
  "/manifest.json",
  "/dist/main-T54FPVZJ.js",
  "/dist/modals-5T6N72XV.js",
  "/dist/chunk-N5JQ5VEO.js"
];

self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Service Worker: Installation complete');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('Service Worker: Caching failed', err);
      })
  );
});

self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
        console.log('Service Worker: Activation complete');
        return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', event => {
  // We only want to cache GET requests.
  if (event.request.method !== 'GET') {
    return;
  }

  // For navigation requests (i.e., for HTML pages), use a network-first strategy.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        // If the network fails, serve the offline page from the cache.
        return caches.match('/offline.html');
      })
    );
    return;
  }

  // For all other requests (CSS, JS, images), use a cache-first strategy.
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // If the file is in the cache, serve it.
        if (response) {
          return response;
        }
        // If not, fetch it from the network.
        return fetch(event.request);
      })
  );
});