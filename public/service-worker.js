/**
 * Minimal service worker for PWA installability
 * Does NOT aggressively cache or interfere with WebSocket/audio connections
 */

const CACHE_NAME = 'gemini-console-v1';

// Only cache static assets, not API calls or WebSocket connections
const staticAssets = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/apple-touch-icon.png',
  '/bg-2.png',
  '/icons/icon-big-2.png',
  '/icons/icon-small-2.png'
];

// Install event - cache only basic static files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(staticAssets);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Network-first strategy to ensure live API always gets fresh data
// Only fallback to cache for static assets - NEVER for API calls or WebSockets
self.addEventListener('fetch', event => {
  // Skip WebSocket connections and API calls to ensure they always go to network
  if (event.request.url.includes('wss://') || 
      event.request.url.includes('ws://') ||
      event.request.url.includes('generativelanguage.googleapis.com')) {
    return;
  }

  // For normal page navigation, prioritize network
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/index.html');
      })
    );
    return;
  }

  // For static assets, try network first, fallback to cache
  if (staticAssets.some(asset => event.request.url.includes(asset))) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  
  // For everything else, just fetch from network
  // This ensures we don't interfere with any dynamic requests
}); 