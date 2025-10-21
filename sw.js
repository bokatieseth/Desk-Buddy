// Service worker cache for 工位萌伴园
const CACHE = 'mengbanyuan-v17';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './lang.js',
  './app.js',
  './manifest.webmanifest',
  './assets/logo/title.png',
  './assets/scene/desk_bg.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => { e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))); });
