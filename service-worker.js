// This is the template for your service worker.
// The build script will read this file, fill in the placeholders,
// and create the final 'service-worker.js' file.

// ▼ Placeholder for the cache name. The build script will replace this.
// Example: 'jlpt-handbook-cache-v1.0.2'
const CACHE_NAME = 'jlpt-handbook-cache-v1.0.2';

// ▼ Placeholder for the list of files to cache. The build script will replace this
// with an array of all your newly built CSS and JS files.
const urlsToCache = [
  "/",
  "/index.html",
  "/dist/main.min.css",
  "/dist/deferred.min.css",
  "/assets/siteIcon.webp",
  "/assets/siteIcon.png",
  "/assets/og.png",
  "/manifest.json",
  "/dist/main-OGVRAUJY.js",
  "/dist/modals-AJ6R5UMA.js",
  "/dist/chunk-F7OFINK2.js"
];

// --- INSTALL: Caches the essential files for the PWA ---
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
        // This is important for debugging. If caching fails, this will log the error.
        console.error('Service Worker: Caching failed', err);
      })
  );
});

// --- ACTIVATE: Cleans up old caches ---
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

// --- FETCH: Serves assets from cache first ---
self.addEventListener('fetch', event => {
  // We only want to cache GET requests.
  if (event.request.method !== 'GET') {
    return;
  }

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