const CACHE_NAME = 'inpi-map-v1';
const urlsToCache = [
  '/',
  '/static/css/main.css',
  '/static/js/main.js',
  '/logo_SEGOB.png'
];

// Cachear tiles de mapa
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('.pmtiles') || 
      event.request.url.includes('mapabase.atdt.gob.mx')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((response) => {
          return response || fetch(event.request).then((fetchResponse) => {
            cache.put(event.request, fetchResponse.clone());
            return fetchResponse;
          });
        });
      })
    );
  }
});