const CACHE_NAME = 'jlpt-handbook-cache-v2';

// This list includes all the essential files your app needs to work offline.
// The paths are based on your index.html file structure.
const urlsToCache = [
  '/',
  '/index.html',
  '/dist/main.min.css',
  '/dist/deferred.min.css',
  '/dist/main.js',
  '/assets/siteIcon.webp',
  '/assets/siteIcon.png',
  '/assets/og.png',
  '/manifest.json'
];

// --- INSTALL: Caches the essential files for the PWA ---
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching app shell');
        // We use individual add calls with error handling to debug which file is failing.
        const promises = urlsToCache.map(url => {
            return cache.add(url).catch(err => {
                console.error(`Failed to cache ${url}:`, err);
            });
        });
        return Promise.all(promises);
      })
      .then(() => {
        console.log('Service Worker: Installation complete');
        return self.skipWaiting();
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