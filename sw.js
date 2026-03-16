// ═══════════════════════════════════════════════════════════
// RIQO — Service Worker
// Estrategia: Cache First para assets, Network First para datos
// ═══════════════════════════════════════════════════════════

const CACHE_NAME = 'riqo-v1.0.0';
const OFFLINE_URL = '/';

// Assets a cachear en instalación
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // CDN externos — Chart.js y Google Fonts
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500;600&family=Space+Mono:wght@400;700&display=swap'
];

// ── INSTALL: cachear todos los assets ──────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Cachear assets locales (críticos)
        return cache.addAll(['/','index.html','manifest.json']);
      })
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: limpiar caches viejos ───────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// ── FETCH: Cache First con fallback a red ──────────────────
self.addEventListener('fetch', event => {
  // Ignorar requests que no son GET
  if(event.request.method !== 'GET') return;
  
  // Ignorar Chrome extensions y non-http
  if(!event.request.url.startsWith('http')) return;

  // API de tipo de cambio — siempre intentar red
  if(event.request.url.includes('open.er-api.com')){
    event.respondWith(
      fetch(event.request).catch(() => 
        new Response(JSON.stringify({result:'error'}), {
          headers: {'Content-Type': 'application/json'}
        })
      )
    );
    return;
  }

  // Google Fonts — Cache First
  if(event.request.url.includes('fonts.googleapis.com') || 
     event.request.url.includes('fonts.gstatic.com')){
    event.respondWith(
      caches.match(event.request).then(cached => {
        if(cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // CDN (Chart.js, etc.) — Cache First
  if(event.request.url.includes('cdnjs.cloudflare.com')){
    event.respondWith(
      caches.match(event.request).then(cached => {
        if(cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // App principal — Cache First con actualización en background
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        if(response && response.status === 200){
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => null);

      return cached || fetchPromise || caches.match('/index.html');
    })
  );
});

// ── BACKGROUND SYNC (cuando vuelve la conexión) ───────────
self.addEventListener('sync', event => {
  if(event.tag === 'sync-rates'){
    event.waitUntil(
      fetch('https://open.er-api.com/v6/latest/USD')
        .then(r => r.json())
        .then(data => {
          // Notificar a la app que hay nuevos tipos de cambio
          return self.clients.matchAll().then(clients => {
            clients.forEach(client => 
              client.postMessage({type:'FX_UPDATE', data: data.rates})
            );
          });
        })
        .catch(() => {})
    );
  }
});

// ── PUSH NOTIFICATIONS (futuro) ───────────────────────────
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'RIQO', {
      body: data.body || 'Nueva notificación de RIQO',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      data: data
    })
  );
});
