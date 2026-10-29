// Service Worker for Video Merger PWA
// Caches the app shell + FFmpeg.wasm assets for offline use after first load

const CACHE_NAME = 'video-merger-v2';
const BASE_URL = 'https://monsihaidi.github.io/video-merger';

// App shell — absolute URLs for correct caching on GitHub Pages subdirectory
const APP_SHELL = [
  BASE_URL + '/',
  BASE_URL + '/index.html',
  BASE_URL + '/manifest.json',
  BASE_URL + '/favicon.svg',
  BASE_URL + '/icon-192.png',
  BASE_URL + '/icon-512.png',
  BASE_URL + '/apple-touch-icon.png',
];

// CDN URLs for FFmpeg.wasm (cached for offline use after first successful load)
const CDN_ASSETS = [
  'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js',
  'https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/index.js',
  'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/814.ffmpeg.js',
  'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
  'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
  // Fallback CDNs
  'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js',
  'https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/umd/index.js',
  'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/814.ffmpeg.js',
  'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
  'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
];

// Install: cache the app shell immediately
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache app shell — fail silently if any asset fails (CDN might be down)
      return Promise.allSettled(
        [...APP_SHELL, ...CDN_ASSETS].map(url =>
          cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err.message))
        )
      );
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Fetch: serve from cache first, fall back to network
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip blob: URLs (used for video files — must NOT be cached)
  if (request.url.startsWith('blob:')) return;

  // Skip data: URLs
  if (request.url.startsWith('data:')) return;

  // For same-origin requests (app shell), try cache first
  if (new URL(request.url).origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cached => {
        return cached || fetch(request).then(response => {
          // Cache new responses for same-origin
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // For cross-origin CDN requests (FFmpeg.wasm assets), try cache first
  if (CDN_ASSETS.some(url => request.url.startsWith(url.split('/umd/')[0]))) {
    event.respondWith(
      caches.match(request).then(cached => {
        return cached || fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        }).catch(() => {
          // If both cache and network fail, return a generic error
          return new Response('Network error', { status: 503 });
        });
      })
    );
    return;
  }

  // All other requests: just fetch from network
  // (don't cache — e.g., video files selected by the user)
});

// Listen for messages from the page
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
