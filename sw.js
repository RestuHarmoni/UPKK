const CACHE_NAME = 'upkk-smartkids-admin-question-manager-v3';
const CORE_ASSETS = [
  './',
  './index.html',
  './app.html',
  './style.css',
  './app.js',
  './firebase-config.js',
  './manifest.json',
  './offline.html',
  './assets/logo.webp',
  './assets/logo-pwa.png',
  './assets/icons/icon-72.png',
  './assets/icons/icon-96.png',
  './assets/icons/icon-144.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon-32.png',
  './assets/icons/favicon-16.png',
  './assets/avatar-boy.webp',
  './assets/avatar-girl.webp',
  './dashboard.html',
  './latihan.html',
  './exam.html',
  './result.html',
  './profile.html',
  './settings.html',
  './about.html',
  './splash.html',
  './reset-firebase.html',
  './admin.html',
  './admin-login.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(CORE_ASSETS.map((asset) => cache.add(new Request(asset, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((client) => client.postMessage({ type: 'UPKK_SW_UPDATED', version: CACHE_NAME }));
  })());
});

function isHtmlRequest(request, url) {
  return request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/');
}

function normalizePath(url) {
  let path = url.pathname.split('/').pop() || 'index.html';
  return './' + path;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isHtmlRequest(request, url)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request, { cache: 'no-store' });
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, fresh.clone());
        return fresh;
      } catch (err) {
        return (await caches.match(request)) || (await caches.match(normalizePath(url))) || (await caches.match('./app.html')) || (await caches.match('./offline.html'));
      }
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      const fresh = await fetch(request, { cache: 'reload' });
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, fresh.clone());
      return fresh;
    } catch (err) {
      return (await caches.match(request)) || (await caches.match(normalizePath(url))) || (await caches.match('./offline.html'));
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
