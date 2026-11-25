const CACHE_NAME = 'restoorder-shell-v6';
const APP_SHELL_ASSETS = [
  './css/adminlte.css',
  './css/restaurant.css',
  './js/adminlte.js',
  './js/app-client.js',
  './js/app-router.js',
  './js/pages/dashboard.js',
  './js/pages/pesanan.js',
  './js/pages/chef.js',
  './js/pages/menu.js',
  './js/pages/pengguna.js',
  './js/pages/pengaturan.js',
  './assets/img/app-icon.svg',
  './assets/img/app-icon-192.png',
  './assets/img/app-icon-512.png',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Jangan pernah cache endpoint API atau autentikasi
  if (url.pathname.startsWith('/api/')) return;

  // HTML / navigasi: network-first dengan fallback cache agar selalu segar
  if (request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('./login.html')))
    );
    return;
  }

  // Aset statis lokal (CSS, JS, gambar): stale-while-revalidate agar instan
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
