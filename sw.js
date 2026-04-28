// 유효숫자 마스터 — Service Worker (오프라인 폴백 + 정적 캐시)
const CACHE = 'sigfig-v2-' + (self.registration?.scope || '');
const CORE = [
  '/',
  '/home.html',
  '/room.html',
  '/teacher.html',
  '/leaderboard.html',
  '/common.css',
  '/common.js',
  '/manifest.webmanifest',
  '/icon.svg',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // API 요청은 항상 네트워크 — 오프라인이면 의미 있는 에러
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).catch(() => new Response(JSON.stringify({ error: '오프라인' }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
    return;
  }
  // 정적 리소스: cache-first
  if (e.request.method === 'GET') {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok && url.origin === location.origin) {
        const clone = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return r;
    }).catch(() => caches.match('/home.html'))));
  }
});
