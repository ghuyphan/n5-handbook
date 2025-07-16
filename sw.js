const CACHE_NAME = 'jlpt-handbook-cache-v1';
const FONT_CACHE_NAME = 'jlpt-handbook-font-cache-v1';

// Pre-cache essential assets that make up the app shell
const urlsToCache = [
  '/',
  '/index.html',
  '/dist/main.min.css',
  '/dist/deferred.min.css',
  '/dist/main.min.js',
  '/assets/siteIcon.png'
];

// Separate list for fonts that we want to cache aggressively
const fontUrls = [
  '/assets/fonts/noto-sans-jp-v54-japanese_latin-700.woff2',
  '/assets/fonts/noto-sans-jp-v54-japanese_latin-regular.woff2',
  '/assets/fonts/inter-v19-latin_latin-ext_vietnamese-700.woff2',
  '/assets/fonts/inter-v19-latin_latin-ext_vietnamese-600.woff2',
  '/assets/fonts/inter-v19-latin_latin-ext_vietnamese-regular.woff2',
  '/assets/fonts/klee-one-v12-latin-regular.woff2'
];

// Install the service worker and pre-cache app shell and fonts
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)),
      caches.open(FONT_CACHE_NAME).then(cache => cache.addAll(fontUrls))
    ])
  );
});

// Serve cached content when offline
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Strategy for fonts: Cache first, then network.
  if (fontUrls.some(fontUrl => requestUrl.pathname.endsWith(fontUrl))) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        return cachedResponse || fetch(event.request).then(response => {
          // Cache the new font file for next time
          return caches.open(FONT_CACHE_NAME).then(cache => {
            cache.put(event.request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // Strategy for other requests: Network first, then cache.
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});