const CACHE_NAME = 'jlpt-handbook-cache-v2'; // Bumped version
const FONT_CACHE_NAME = 'jlpt-handbook-font-cache-v1';

// App shell files - critical for the app to work
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/dist/main.min.css',
  '/dist/deferred.min.css',
  '/dist/main.min.js',
  '/assets/siteIcon.png'
];

// Fonts
const FONT_URLS = [
  '/assets/fonts/noto-sans-jp-v54-japanese_latin-700.woff2',
  '/assets/fonts/noto-sans-jp-v54-japanese_latin-regular.woff2',
  '/assets/fonts/inter-v19-latin_latin-ext_vietnamese-700.woff2',
  '/assets/fonts/inter-v19-latin_latin-ext_vietnamese-600.woff2',
  '/assets/fonts/inter-v19-latin_latin-ext_vietnamese-regular.woff2',
  '/assets/fonts/klee-one-v12-latin-regular.woff2'
];


// Install event: cache all essential assets.
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL_URLS)),
      caches.open(FONT_CACHE_NAME).then(cache => cache.addAll(FONT_URLS))
    ])
  );
});


// Activate event: clean up old caches.
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME && cacheName !== FONT_CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});


// Fetch event: apply caching strategies.
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Use Cache First for fonts
    if (FONT_URLS.some(fontUrl => url.pathname.endsWith(fontUrl))) {
        event.respondWith(
            caches.match(request).then(cachedResponse => {
                return cachedResponse || fetch(request).then(response => {
                    const responseToCache = response.clone();
                    caches.open(FONT_CACHE_NAME).then(cache => {
                        cache.put(request, responseToCache);
                    });
                    return response;
                });
            })
        );
        return;
    }

    // Use Stale-While-Revalidate for App Shell and Data
    event.respondWith(
        caches.open(CACHE_NAME).then(cache => {
            return cache.match(request).then(cachedResponse => {
                const fetchPromise = fetch(request).then(networkResponse => {
                    // Don't cache chrome-extension requests
                    if (request.url.startsWith('chrome-extension://')) {
                        return networkResponse;
                    }
                    const responseToCache = networkResponse.clone();
                    cache.put(request, responseToCache);
                    return networkResponse;
                }).catch(() => {
                    // Return the cached response if the network fails
                    return cachedResponse;
                });

                // Return cached response immediately, and update the cache in the background.
                return cachedResponse || fetchPromise;
            });
        })
    );
});