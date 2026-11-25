// Scope /player/ only. Never cache API requests, the GM application, campaign logs or invite URLs.
const CACHE = 'dm-player-shell-v1';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/player/', '/player/manifest.webmanifest', '/player/icon-192.png', '/player/icon-512.png'])));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('dm-player-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  const shell = url.pathname === '/player/' || url.pathname === '/player/index.html';
  const asset = url.pathname.startsWith('/assets/') || /^\/player\/(?:icon-(?:192|512)\.png|manifest\.webmanifest)$/.test(url.pathname);
  if (!shell && !asset) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      // Canonicalize navigation; do not retain fragments/query invitation strings as cache keys.
      void caches.open(CACHE).then(cache => cache.put(shell ? '/player/' : url.pathname, copy));
    }
    return response;
  }).catch(async () => (await caches.match(shell ? '/player/' : url.pathname)) ?? Response.error()));
});
