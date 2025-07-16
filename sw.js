// A more descriptive cache name
const CACHE_NAME = 'jlpt-handbook-assets-v1';
const FONT_CACHE_NAME = 'jlpt-handbook-fonts-v1';
const DATA_CACHE_NAME = 'jlpt-handbook-data-v1';


const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/dist/main.min.css',
  '/dist/deferred.min.css',
  '/dist/main.min.js',
  '/assets/siteIcon.png',
  '/assets/siteIcon.webp' // Added webp version
];

const FONT_URLS = [
  '/assets/fonts/noto-sans-jp-v54-japanese_latin-700.woff2',
  '/assets/fonts/noto-sans-jp-v54-japanese_latin-regular.woff2',
  '/assets/fonts/inter-v19-latin_latin-ext_vietnamese-700.woff2',
  '/assets/fonts/inter-v19-latin_latin-ext_vietnamese-600.woff2',
  '/assets/fonts/inter-v19-latin_latin-ext_vietnamese-regular.woff2',
  '/assets/fonts/klee-one-v12-latin-regular.woff2'
];

// Install: Cache all essential assets.
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL_URLS)),
      caches.open(FONT_CACHE_NAME).then(cache => cache.addAll(FONT_URLS))
    ]).then(() => self.skipWaiting()) // Force the new service worker to activate
  );
});

// Activate: Clean up old caches.
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME, FONT_CACHE_NAME, DATA_CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (!cacheWhitelist.includes(cacheName)) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Take control of all pages
    );
});


self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Strategy for fonts: Cache First
    if (url.pathname.startsWith('/assets/fonts/')) {
        event.respondWith(caches.match(request).then(cachedResponse => {
            return cachedResponse || fetch(request).then(networkResponse => {
                const responseToCache = networkResponse.clone();
                caches.open(FONT_CACHE_NAME).then(cache => cache.put(request, responseToCache));
                return networkResponse;
            });
        }));
        return;
    }
    
    // Strategy for data from GitHub: Network first, then cache
    if (url.hostname === 'raw.githubusercontent.com') {
        event.respondWith(
            fetch(request)
            .then(networkResponse => {
                const responseToCache = networkResponse.clone();
                caches.open(DATA_CACHE_NAME).then(cache => {
                    cache.put(request, responseToCache);
                });
                return networkResponse;
            })
            .catch(() => caches.match(request))
        );
        return;
    }
    
    // Strategy for App Shell: Stale-While-Revalidate
    event.respondWith(
        caches.match(request).then(cachedResponse => {
            const fetchPromise = fetch(request).then(networkResponse => {
                if (request.url.startsWith('chrome-extension://')) {
                    return networkResponse;
                }
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(request, responseToCache);
                });
                return networkResponse;
            });
            return cachedResponse || fetchPromise;
        })
    );
});